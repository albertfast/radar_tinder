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

  private let grid: RadarLifeGrid
  private let device: MTLDevice
  private let commandQueue: MTLCommandQueue
  private let pipelineState: MTLRenderPipelineState

  private var energyBuffer = Array(repeating: Float.zero, count: RadarLifeGrid.size * RadarLifeGrid.size)

  private var lastTickTime: CFTimeInterval = CACurrentMediaTime()
  private var lastFrameTime: CFTimeInterval = CACurrentMediaTime()
  private var sweepAngle: Float = 0
  private var orbitPhase: Float = 0

  var rotationSpeed: Float = 1 {
    didSet {
      rotationSpeed = max(0.1, min(rotationSpeed, 6))
    }
  }

  var pulseEnabled: Bool = true

  var signalLevel: Float = 0 {
    didSet {
      signalLevel = Self.clamp01(signalLevel)
      grid.setSignalLevel(signalLevel)
    }
  }

  var dangerLevel: Float = 0 {
    didSet {
      dangerLevel = Self.clamp01(dangerLevel)
      grid.setDangerLevel(dangerLevel)
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
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
    // no-op
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

    orbitPhase += dt * rotationSpeed * 1.2
    sweepAngle += dt * rotationSpeed * 90
    if sweepAngle > 360 {
      sweepAngle -= 360
    }

    let pulse = pulseEnabled ? (0.08 + 0.02 * sin(Float(now) * 5.5)) : 0.08

    let diskVertices = makeDisk(radius: 0.82, segments: 64, color: SIMD4<Float>(
      primary.x * 0.32,
      primary.y * 0.32,
      primary.z * 0.32,
      pulse
    ))

    let ringA = makeRing(radius: 0.28, segments: 96, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.20))
    let ringB = makeRing(radius: 0.52, segments: 96, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.24))
    let ringC = makeRing(radius: 0.76, segments: 96, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.28))

    let orbitA = makeOrbit(radius: 0.36, segments: 120, phase: orbitPhase, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.16))
    let orbitB = makeOrbit(radius: 0.57, segments: 120, phase: orbitPhase + 2.094, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.18))
    let orbitC = makeOrbit(radius: 0.74, segments: 120, phase: orbitPhase + 4.188, color: SIMD4<Float>(secondary.x, secondary.y, secondary.z, 0.20))

    let cellVertices = makeCellQuads(primary: primary, secondary: secondary)

    let sweepVertices = makeSweep(
      radius: 0.82,
      arcDegrees: 45,
      angleDegrees: sweepAngle,
      segments: 18,
      color: SIMD4<Float>(primary.x, primary.y, primary.z, 0.20)
    )

    encoder.setRenderPipelineState(pipelineState)

    drawVertices(diskVertices, primitive: .triangle, encoder: encoder)
    drawVertices(ringA, primitive: .lineStrip, encoder: encoder)
    drawVertices(ringB, primitive: .lineStrip, encoder: encoder)
    drawVertices(ringC, primitive: .lineStrip, encoder: encoder)

    drawVertices(orbitA, primitive: .lineStrip, encoder: encoder)
    drawVertices(orbitB, primitive: .lineStrip, encoder: encoder)
    drawVertices(orbitC, primitive: .lineStrip, encoder: encoder)

    drawVertices(cellVertices, primitive: .triangle, encoder: encoder)
    drawVertices(sweepVertices, primitive: .triangle, encoder: encoder)

    encoder.endEncoding()
    commandBuffer.present(drawable)
    commandBuffer.commit()
  }

  private func makeDisk(radius: Float, segments: Int, color: SIMD4<Float>) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }
    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments * 3)

    let center = RadarLifeVertex(position: .zero, color: color)
    for i in 0..<segments {
      let a0 = (Float(i) / Float(segments)) * 2 * Float.pi
      let a1 = (Float(i + 1) / Float(segments)) * 2 * Float.pi
      let p0 = SIMD2<Float>(cos(a0) * radius, sin(a0) * radius)
      let p1 = SIMD2<Float>(cos(a1) * radius, sin(a1) * radius)
      vertices.append(center)
      vertices.append(RadarLifeVertex(position: p0, color: color))
      vertices.append(RadarLifeVertex(position: p1, color: color))
    }

    return vertices
  }

  private func makeRing(radius: Float, segments: Int, color: SIMD4<Float>) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }
    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments + 1)

    for i in 0...segments {
      let angle = (Float(i) / Float(segments)) * 2 * Float.pi
      let p = SIMD2<Float>(cos(angle) * radius, sin(angle) * radius)
      vertices.append(RadarLifeVertex(position: p, color: color))
    }

    return vertices
  }

  private func makeOrbit(
    radius: Float,
    segments: Int,
    phase: Float,
    color: SIMD4<Float>
  ) -> [RadarLifeVertex] {
    guard segments >= 3 else { return [] }
    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments + 1)

    for i in 0...segments {
      let angle = (Float(i) / Float(segments)) * 2 * Float.pi
      let distortion = 0.02 * sin(angle * 3 + phase)
      let r = radius + distortion
      let p = SIMD2<Float>(cos(angle) * r, sin(angle) * r)
      vertices.append(RadarLifeVertex(position: p, color: color))
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

    let arc = arcDegrees * (.pi / 180)
    let centerAngle = angleDegrees * (.pi / 180)
    let start = centerAngle - arc * 0.5

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(segments * 3)

    let center = RadarLifeVertex(position: .zero, color: color)
    for i in 0..<segments {
      let a0 = start + (Float(i) / Float(segments)) * arc
      let a1 = start + (Float(i + 1) / Float(segments)) * arc
      let p0 = SIMD2<Float>(cos(a0) * radius, sin(a0) * radius)
      let p1 = SIMD2<Float>(cos(a1) * radius, sin(a1) * radius)
      vertices.append(center)
      vertices.append(RadarLifeVertex(position: p0, color: color))
      vertices.append(RadarLifeVertex(position: p1, color: color))
    }

    return vertices
  }

  private func makeCellQuads(
    primary: SIMD4<Float>,
    secondary: SIMD4<Float>
  ) -> [RadarLifeVertex] {
    let size = RadarLifeGrid.size
    let gridWorldSize: Float = 1.58
    let cellStep = gridWorldSize / Float(size)

    var vertices: [RadarLifeVertex] = []
    vertices.reserveCapacity(size * size * 6)

    for y in 0..<size {
      for x in 0..<size {
        let idx = y * size + x
        let energy = energyBuffer[idx]
        if energy < 0.02 {
          continue
        }

        let wx = (Float(x) - Float(size) * 0.5 + 0.5) * cellStep
        let wy = (Float(y) - Float(size) * 0.5 + 0.5) * cellStep
        let dist = sqrt(wx * wx + wy * wy)
        if dist > 0.82 {
          continue
        }

        let lift = energy * 0.035
        let center = SIMD2<Float>(wx, wy + lift)
        let half = 0.006 + energy * 0.011

        let blend = Self.clamp01(energy)
        var color = primary * (1 - blend) + secondary * blend
        color.w = min(1, energy * 1.6) * (1 - dist * 0.45)

        appendQuad(center: center, half: half, color: color, to: &vertices)
      }
    }

    return vertices
  }

  private func appendQuad(
    center: SIMD2<Float>,
    half: Float,
    color: SIMD4<Float>,
    to vertices: inout [RadarLifeVertex]
  ) {
    let lt = SIMD2<Float>(center.x - half, center.y + half)
    let rt = SIMD2<Float>(center.x + half, center.y + half)
    let lb = SIMD2<Float>(center.x - half, center.y - half)
    let rb = SIMD2<Float>(center.x + half, center.y - half)

    vertices.append(RadarLifeVertex(position: lt, color: color))
    vertices.append(RadarLifeVertex(position: lb, color: color))
    vertices.append(RadarLifeVertex(position: rt, color: color))

    vertices.append(RadarLifeVertex(position: rt, color: color))
    vertices.append(RadarLifeVertex(position: lb, color: color))
    vertices.append(RadarLifeVertex(position: rb, color: color))
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

  private static func lerpColor(_ a: SIMD4<Float>, _ b: SIMD4<Float>, t: Float) -> SIMD4<Float> {
    a + (b - a) * t
  }

  private static func clamp01(_ value: Float) -> Float {
    max(0, min(1, value))
  }
}
