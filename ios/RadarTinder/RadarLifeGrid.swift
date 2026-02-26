import Foundation

final class RadarLifeGrid {
  static let size = 36

  private let aliveEnergyBoost: Float = 0.15
  private let deadEnergyDecay: Float = 0.92
  private let injectionBase: Float = 0.4
  private let aliveInitialEnergy: Float = 0.6
  private let seedDensity: Float = 0.18

  private var alive: [Bool]
  private var nextAlive: [Bool]
  private var energy: [Float]

  private var signalLevel: Float = 0
  private var dangerLevel: Float = 0

  private let lock = NSLock()

  init() {
    let total = Self.size * Self.size
    alive = Array(repeating: false, count: total)
    nextAlive = Array(repeating: false, count: total)
    energy = Array(repeating: 0, count: total)
    seed()
  }

  func seed() {
    lock.lock()
    defer { lock.unlock() }

    for y in 0..<Self.size {
      for x in 0..<Self.size {
        let idx = index(x, y)
        let isAlive = Float.random(in: 0...1) < seedDensity
        alive[idx] = isAlive
        nextAlive[idx] = false
        energy[idx] = isAlive ? aliveInitialEnergy : 0
      }
    }
  }

  func setSignalLevel(_ level: Float) {
    lock.lock()
    signalLevel = Self.clamp01(level)
    lock.unlock()
  }

  func setDangerLevel(_ level: Float) {
    lock.lock()
    dangerLevel = Self.clamp01(level)
    lock.unlock()
  }

  func tick() {
    lock.lock()
    defer { lock.unlock() }

    for y in 0..<Self.size {
      for x in 0..<Self.size {
        let idx = index(x, y)
        let neighbors = countNeighbors(x: x, y: y)
        if alive[idx] {
          nextAlive[idx] = neighbors == 2 || neighbors == 3
        } else {
          nextAlive[idx] = neighbors == 3
        }
      }
    }

    swap(&alive, &nextAlive)

    for y in 0..<Self.size {
      for x in 0..<Self.size {
        let idx = index(x, y)
        if alive[idx] {
          energy[idx] = min(1, energy[idx] + aliveEnergyBoost)
        } else {
          energy[idx] *= deadEnergyDecay
          if energy[idx] < 0.01 {
            energy[idx] = 0
          }
        }
      }
    }

    injectRadarSignal()
  }

  func copyEnergy(to destination: inout [Float]) {
    lock.lock()
    defer { lock.unlock() }

    if destination.count != energy.count {
      destination = Array(repeating: 0, count: energy.count)
    }
    destination.replaceSubrange(0..<energy.count, with: energy)
  }

  private func injectRadarSignal() {
    let center = Self.size / 2
    let strength = injectionBase + signalLevel * 0.4 + dangerLevel * 0.3
    let radius = 3 + Int(signalLevel * 5)

    for dy in -radius...radius {
      for dx in -radius...radius {
        let dist = sqrt(Float(dx * dx + dy * dy))
        if dist > Float(radius) {
          continue
        }

        let nx = (center + dx + Self.size) % Self.size
        let ny = (center + dy + Self.size) % Self.size
        let idx = index(nx, ny)
        let falloff = 1 - (dist / Float(radius + 1))
        let injected = strength * falloff * (0.7 + Float.random(in: 0...1) * 0.3)

        energy[idx] = min(1, energy[idx] + injected * 0.3)

        if !alive[idx] && Float.random(in: 0...1) < injected * 0.1 {
          alive[idx] = true
        }
      }
    }
  }

  private func countNeighbors(x: Int, y: Int) -> Int {
    var count = 0

    for dy in -1...1 {
      for dx in -1...1 {
        if dx == 0 && dy == 0 {
          continue
        }
        let nx = (x + dx + Self.size) % Self.size
        let ny = (y + dy + Self.size) % Self.size
        if alive[index(nx, ny)] {
          count += 1
        }
      }
    }

    return count
  }

  private func index(_ x: Int, _ y: Int) -> Int {
    y * Self.size + x
  }

  private static func clamp01(_ value: Float) -> Float {
    max(0, min(1, value))
  }
}
