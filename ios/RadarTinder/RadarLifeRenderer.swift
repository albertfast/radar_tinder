import Foundation
import Metal
import MetalKit
import simd

private struct RadarLifeVertex {
  var position: SIMD2<Float>
  var color: SIMD4<Float>
}

final class RadarLifeRenderer: NSObject, MTKViewDelegate {
  private static let normalPrimary = SIMD4<Float>(0.306, 0.804, 0.769, 1)
  private static let normalSecondary = SIMD4<Float>(0.220, 0.741, 0.973, 1)
  private static let dangerPrimary = SIMD4<Float>(1.000, 0.322, 0.322, 1)
  private static let dangerSecondary = SIMD4<Float>(1.000, 0.420, 0.231, 1)

  private static let tickInterval: CFTimeInterval = 0.125

  private static let diskSegments = 64
  private static let ringSegments = 64
  private static let ringRadii: [Float] = [0.35, 0.65, 0.95]
  private static let orbitSegments = 80
  private static let orbitRadii: [Float] = [0.45, 0.70, 0.90]
  private static let orbitRibbonWidth: Float = 0.015
  private static let sweepSegments = 16
  private static let sweepArcDegrees: Float = 45
  private static let cellQuadSize: Float = 0.018
  private static let gridWorldSize: Float = 1.8

  private static let cameraTiltDegrees: Float = 21
  private static let cameraDistance: Float = 3.2
  private static let fieldOfViewDegrees: Float = 45

  private let grid: RadarLifeGrid
  private let device: MTLDevice
  private let commandQueue: MTLCommandQueue
  private let pipelineState: MTLRenderPipelineState

  private var energyBuffer = Array(repeating: Float.zero, count: RadarLifeGrid.size * RadarLifeGrid.size)

  private var lastTickTime: CFTimeInterval = CACurrentMediaTime()
  private var lastFrameTime: CFTimeInterval = CACurrentMediaTime()
  private var sweepAngle: Float = 0
  private var orbitPhase: Float = 0

  private var viewProjectionMatrix = matrix_identity_float4x4

  var rotationSpeed: Float = 1 {
    didSet {
      rotationSpeed = max(0.1, min(rotationSpeed, 6))
    }
  }

  var pulseEnabled: Bool = true

  var signalLevel: Float = 0 {
    didSet {
      let clamped = Self.clamp01(signalLevel)
      if clamped != signalLevel {
        signalLevel = clamped
        return
      }
      grid.setSignalLevel(clamped)
    }
  }

  var dangerLevel: Float = 0 {
    didSet {
      let clamped = Self.clamp01(dangerLevel)
      if clamped != dangerLevel {
        dangerLevel = clamped
        return
      }
      grid.setDangerLevel(clamped)
    }
  }

  var themeVariant: String = "contour_orbit"
  var paused: Bool = false

  init?(view: MTKView, grid: RadarLifeGrid) {
    guard let metalDevice = MTLCreateSystemDefaultDevice(),
          let queue = metalDevice.makeCommandQueue(),
          let library = metalDevice.makeDefaultLibrary(),
          let vertexFunction = library.makeFunction(name: "radarVertex"),
          let fragmentFunction = library.makeFunction(name: "radarFragment")
    else {
      return nil
    }

    let vertexDescriptor = MTLVertexDescriptor()
    vertexDescriptor.attributes[0].format = .float2
    vertexDescriptor.attributes[0].offset = 0
    vertexDescriptor.attributes[0].bufferIndex = 0
    vertexDescriptor.attributes[1].format = .float4
    vertexDescriptor.attributes[1].offset = MemoryLayout<SIMD2<Float>>.stride
    vertexDescriptor.attributes[1].bufferIndex = 0
    vertexDescriptor.layouts[0].stride = MemoryLayout<RadarLifeVertex>.stride

    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.label = "RadarLifePipeline"
    descriptor.vertexFunction = vertexFunction
    descriptor.fragmentFunction = fragmentFunction
    descriptor.vertexDescriptor = vertexDescriptor
    descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
    descriptor.colorAttachments[0].isBlendingEnabled = true
    descriptor.colorAttachments[0].rgbBlendOperation = .add
    descriptor.colorAttachments[0].alphaBlendOperation = .add
    descriptor.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
    descriptor.colorAttachments[0].sourceAlphaBlendFactor = .sourceAlpha
    descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
    descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha

    guard let state = try? metalDevice.makeRenderPipelineState(descriptor: descriptor) else {
      return nil
    }

    self.grid = grid
    self.device = metalDevice
    self.commandQueue = queue
    self.pipelineState = state

    super.init()

    view.device = metalDevice
    view.colorPixelFormat = .bgra8Unorm
    view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
    view.isOpaque = false
    view.framebufferOnly = false
    view.enableSetNeedsDisplay = false
    view.preferredFramesPerSecond = 60

    updateViewProjection(for: view.drawableSize)
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
    updateViewProjection(for: size)
  }

  func draw(in view: MTKView) {
    guard !paused,
          let drawable = view.currentDrawable,
          let renderPassDescriptor = view.currentRenderPassDescriptor,
          let commandBuffer = commandQueue.makeCommandBuffer(),
          let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: renderPassDescriptor)
    else {
      return
    }

    let now = CACurrentMediaTime()
    let dt = Float(max(1.0 / 120.0, min(now - lastFrameTime, 1.0 / 20.0)))
    lastFrameTime = now

    if now - lastTickTime >= Self.tickInterval {
      grid.tick()
      lastTickTime = now
    }

    grid.copyEnergy(to: &energyBuffer)

    let primary = Self.lerpColor(Self.normalPrimary, Self.dangerPrimary, t: dangerLevel)
    let secondary = Self.lerpColor(Self.normalSecondary, Self.dangerSecondary, t: dangerLevel)

    orbitPhase += dt * rotationSpeed * 20
    sweepAngle += dt * rotationSpeed * 90
    if sweepAngle >= 360 {
      sweepAngle -= 360
    }

    let pulse = pulseEnabled ? (0.08 + 0.02 * sin(Float(now) * 2.0)) : 0.08

    let diskColor = SIMD4<Float>(primary.x * 0.3, primary.y * 0.3, primary.z * 0.3, pulse)
    let diskVertices = makeDisk(radius: 1.0, segments: Self.diskSegments, color: diskColor)

    var ringVertices: [[RadarLifeVertex]] = []
    ringVertices.reserveCapacity(Self.ringRadii.count)
    for (index, radius) in Self.ringRadii.enumerated() {
      let alpha = 0.15 + Float(index) * 0.05
      let color = SIMD4<Float>(secondary.x, secondary.y, secondary.z, alpha)
      ringVertices.append(makeRing(radius: radius, segments: Self.ringSegments, color: color))
    }

    var orbitVertices: [[RadarLifeVertex]] = []
    orbitVertices.reserveCapacity(Self.orbitRadii.count)
    for (index, radius) in Self.orbitRadii.enumerated() {
      let alpha = 0.12 + Float(index) * 0.04
      let color = SIMD4<Float>(secondary.x, secondary.y, secondary.z, alpha)
      let phaseOffset = orbitPhase + Float(index) * 2.094
      orbitVertices.append(
        makeOrbitRibbon(
          radius: radius,
          segments: Self.orbitSegments,
          phase: phaseOffset,
          color: color
        )
      )
    }

    let cellVertices = makeCellQuads(primary: primary, secondary: secondary)

    let sweepColor = SIMD4<Float>(primary.x, primary.y, primary.z, 0.18)
    let sweepVertices = makeSweep(
      radius: 1.0,
      arcDegrees: Self.sweepArcDegrees,
      angleDegrees: sweepAngle,
      segments: Self.sweepSegments,
      color: sweepColor
    )

    encoder.setRenderPipelineState(pipelineState)

    drawVertices(diskVertices, primitive: .triangle, encoder: encoder)

    for ring in ringVertices {
      drawVertices(ring, primitive: .lineStrip, encoder: encoder)
    }

    for orbit in orbitVertices {
      drawVertices(orbit, primitive: .triangleStrip, encoder: encoder)
    }

    drawVertices(cellVertices, primitive: .triangle, encoder: encoder)
    drawVertices(sweepVertices, primitive: .triangle, encoder: encoder)

    encoder.endEncoding()
    commandBuffer.present(drawable)
    commandBuffer.commit()
  }

  private func updateViewProjection(for size: CGSize) {
    let width = max(Float(size.width), 1)
    let height = max(Float(size.height), 1)
    let aspect = width / height

    let projection = Self.makePerspective(
      fovYRadians: Self.fieldOfViewDegrees * (.pi / 180),
      aspect: aspect,
      near: 0.1,
      far: 100
    )

    let tiltRadians = Self.cameraTiltDegrees * (.pi / 180)
    let eyeY = Self.cameraDistance * sin(tiltRadians)
    let eyeZ = Self.cameraDistance * cos(tiltRadians)

    let view = Self.makeLookAt(
      eye: SIMD3<Float>(0, eyeY, eyeZ),
      center: SIMD3<Float>(0, 0, 0),
      up: SIMD3<Float>(0, 1, 0)
    )

    viewProjectionMatrix = projection * view
  }

  private func makeDisk(radius: Float, segments: Int, color: SIMD4<Float>) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments * 3)

    let center = SIMD3<Float>(0, 0, 0)
    for index in 0..<segments {
      let a0 = (Float(index) / Float(segments)) * 2 * Float.pi
      let a1 = (Float(index + 1) / Float(segments)) * 2 * Float.pi
      let p0 = SIMD3<Float>(cos(a0) * radius, 0, sin(a0) * radius)
      let p1 = SIMD3<Float>(cos(a1) * radius, 0, sin(a1) * radius)
      appendTriangle(p0, p1, center, color: color, to: &vertices)
    }

    return vertices
  }

  private func makeRing(radius: Float, segments: Int, color: SIMD4<Float>) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments + 1)

    for index in 0...segments {
      let angle = (Float(index) / Float(segments)) * 2 * Float.pi
      let point = SIMD3<Float>(cos(angle) * radius, 0.001, sin(angle) * radius)
      guard let projected = project(point) else { continue }
      vertices.append(RadarLifeVertex(position: projected, color: color))
    }

    return vertices
  }

  private func makeOrbitRibbon(
    radius: Float,
    segments: Int,
    phase: Float,
    color: SIMD4<Float>
  ) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity((segments + 1) * 2)

    for index in 0...segments {
      let angle = (Float(index) / Float(segments)) * 2 * Float.pi
      let cosAngle = cos(angle)
      let sinAngle = sin(angle)
      let distortion = 0.01 * sin(angle * 3 + phase)
      let yOffset = 0.003 + distortion

      let inner = SIMD3<Float>(
        (radius - Self.orbitRibbonWidth) * cosAngle,
        yOffset,
        (radius - Self.orbitRibbonWidth) * sinAngle
      )
      let outer = SIMD3<Float>(
        (radius + Self.orbitRibbonWidth) * cosAngle,
        yOffset,
        (radius + Self.orbitRibbonWidth) * sinAngle
      )

      if let projectedInner = project(inner) {
        vertices.append(RadarLifeVertex(position: projectedInner, color: color))
      }
      if let projectedOuter = project(outer) {
        vertices.append(RadarLifeVertex(position: projectedOuter, color: color))
      }
    }

    return vertices
  }

  private func makeSweep(
    radius: Float,
    arcDegrees: Float,
    angleDegrees: Float,
    segments: Int,
    color: SIMD4<Float>
  ) -> [RadarLifeVertex] {
    guard segments >= 1 else { return [] }

    let arcRadians = arcDegrees * (.pi / 180)
    let centerAngle = angleDegrees * (.pi / 180)
    let start = centerAngle - (arcRadians * 0.5)

    let center = SIMD3<Float>(0, 0.002, 0)
    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments * 3)

    for index in 0..<segments {
      let a0 = start + (Float(index) / Float(segments)) * arcRadians
      let a1 = start + (Float(index + 1) / Float(segments)) * arcRadians

      let p0 = SIMD3<Float>(cos(a0) * radius, 0.002, sin(a0) * radius)
      let p1 = SIMD3<Float>(cos(a1) * radius, 0.002, sin(a1) * radius)
      appendTriangle(center, p0, p1, color: color, to: &vertices)
    }

    return vertices
  }

  private func makeCellQuads(
    primary: SIMD4<Float>,
    secondary: SIMD4<Float>
  ) -> [RadarLifeVertex] {
    let size = RadarLifeGrid.size
    let cellStep = Self.gridWorldSize / Float(size)
    let cellHalf = Self.cellQuadSize * 0.5

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(size * size * 6)

    for y in 0..<size {
      for x in 0..<size {
        let idx = y * size + x
        let energy = energyBuffer[idx]
        if energy < 0.02 {
          continue
        }

        let wx = (Float(x) - Float(size) / 2 + 0.5) * cellStep
        let wz = (Float(y) - Float(size) / 2 + 0.5) * cellStep
        let wy = energy * 0.15

        let dist = sqrt(wx * wx + wz * wz)
        if dist > 1.0 {
          continue
        }

        let blend = Self.clamp01(energy)
        var color = primary * (1 - blend) + secondary * blend
        color.w = min(1, energy * 1.5) * (1 - dist * 0.5)

        let lt = SIMD3<Float>(wx - cellHalf, wy, wz - cellHalf)
        let rt = SIMD3<Float>(wx + cellHalf, wy, wz - cellHalf)
        let lb = SIMD3<Float>(wx - cellHalf, wy, wz + cellHalf)
        let rb = SIMD3<Float>(wx + cellHalf, wy, wz + cellHalf)

        appendQuad(lt: lt, rt: rt, lb: lb, rb: rb, color: color, to: &vertices)
      }
    }

    return vertices
  }

  private func appendTriangle(
    _ p0: SIMD3<Float>,
    _ p1: SIMD3<Float>,
    _ p2: SIMD3<Float>,
    color: SIMD4<Float>,
    to vertices: inout [RadarLifeVertex]
  ) {
    guard let v0 = project(p0), let v1 = project(p1), let v2 = project(p2) else {
      return
    }

    vertices.append(RadarLifeVertex(position: v0, color: color))
    vertices.append(RadarLifeVertex(position: v1, color: color))
    vertices.append(RadarLifeVertex(position: v2, color: color))
  }

  private func appendQuad(
    lt: SIMD3<Float>,
    rt: SIMD3<Float>,
    lb: SIMD3<Float>,
    rb: SIMD3<Float>,
    color: SIMD4<Float>,
    to vertices: inout [RadarLifeVertex]
  ) {
    appendTriangle(lt, lb, rt, color: color, to: &vertices)
    appendTriangle(rt, lb, rb, color: color, to: &vertices)
  }

  private func project(_ point: SIMD3<Float>) -> SIMD2<Float>? {
    let clip = viewProjectionMatrix * SIMD4<Float>(point, 1)
    if clip.w <= 0.0001 {
      return nil
    }

    let x = clip.x / clip.w
    let y = clip.y / clip.w

    if !x.isFinite || !y.isFinite {
      return nil
    }

    return SIMD2<Float>(x, y)
  }

  private func drawVertices(
    _ vertices: [RadarLifeVertex],
    primitive: MTLPrimitiveType,
    encoder: MTLRenderCommandEncoder
  ) {
    guard !vertices.isEmpty else { return }

    let length = vertices.count * MemoryLayout<RadarLifeVertex>.stride
    guard let buffer = device.makeBuffer(bytes: vertices, length: length, options: .storageModeShared) else {
      return
    }

    encoder.setVertexBuffer(buffer, offset: 0, index: 0)
    encoder.drawPrimitives(type: primitive, vertexStart: 0, vertexCount: vertices.count)
  }

  private static func makePerspective(
    fovYRadians: Float,
    aspect: Float,
    near: Float,
    far: Float
  ) -> simd_float4x4 {
    let yScale = 1 / tan(fovYRadians * 0.5)
    let xScale = yScale / max(aspect, 0.01)
    let zRange = far - near

    return simd_float4x4(
      SIMD4<Float>(xScale, 0, 0, 0),
      SIMD4<Float>(0, yScale, 0, 0),
      SIMD4<Float>(0, 0, -(far + near) / zRange, -1),
      SIMD4<Float>(0, 0, -(2 * far * near) / zRange, 0)
    )
  }

  private static func makeLookAt(
    eye: SIMD3<Float>,
    center: SIMD3<Float>,
    up: SIMD3<Float>
  ) -> simd_float4x4 {
    let f = simd_normalize(center - eye)
    let s = simd_normalize(simd_cross(f, up))
    let u = simd_cross(s, f)

    return simd_float4x4(
      SIMD4<Float>(s.x, u.x, -f.x, 0),
      SIMD4<Float>(s.y, u.y, -f.y, 0),
      SIMD4<Float>(s.z, u.z, -f.z, 0),
      SIMD4<Float>(-simd_dot(s, eye), -simd_dot(u, eye), simd_dot(f, eye), 1)
    )
  }

  private static func lerpColor(_ a: SIMD4<Float>, _ b: SIMD4<Float>, t: Float) -> SIMD4<Float> {
    a + (b - a) * clamp01(t)
  }

  private static func clamp01(_ value: Float) -> Float {
    max(0, min(1, value))
  }
}
