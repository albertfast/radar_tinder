import Foundation
import MetalKit
import UIKit

@objc(RadarLife3DView)
final class RadarLife3DView: UIView {
  private let grid = RadarLifeGrid()
  private let metalView = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
  private var radarRenderer: RadarLifeRenderer?

  @objc var rotationSpeed: NSNumber = 1 {
    didSet {
      radarRenderer?.rotationSpeed = max(0.1, rotationSpeed.floatValue)
    }
  }

  @objc var pulseEnabled: Bool = true {
    didSet {
      radarRenderer?.pulseEnabled = pulseEnabled
    }
  }

  @objc var signalLevel: NSNumber = 0 {
    didSet {
      radarRenderer?.signalLevel = signalLevel.floatValue
    }
  }

  @objc var dangerLevel: NSNumber = 0 {
    didSet {
      radarRenderer?.dangerLevel = dangerLevel.floatValue
    }
  }

  @objc var themeVariant: NSString = "contour_orbit" {
    didSet {
      radarRenderer?.themeVariant = themeVariant as String
    }
  }

  @objc(paused) var radarPaused: Bool = false {
    didSet {
      metalView.isPaused = radarPaused
      radarRenderer?.paused = radarPaused
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    commonInit()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    commonInit()
  }

  deinit {
    metalView.delegate = nil
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    metalView.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let shouldPause = window == nil || radarPaused
    metalView.isPaused = shouldPause
    radarRenderer?.paused = shouldPause
  }

  private func commonInit() {
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = true

    metalView.backgroundColor = .clear
    metalView.isOpaque = false
    metalView.translatesAutoresizingMaskIntoConstraints = false

    addSubview(metalView)
    NSLayoutConstraint.activate([
      metalView.leadingAnchor.constraint(equalTo: leadingAnchor),
      metalView.trailingAnchor.constraint(equalTo: trailingAnchor),
      metalView.topAnchor.constraint(equalTo: topAnchor),
      metalView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    radarRenderer = RadarLifeRenderer(view: metalView, grid: grid)
    metalView.delegate = radarRenderer

    applyCurrentProps()
  }

  private func applyCurrentProps() {
    radarRenderer?.rotationSpeed = max(0.1, rotationSpeed.floatValue)
    radarRenderer?.pulseEnabled = pulseEnabled
    radarRenderer?.signalLevel = signalLevel.floatValue
    radarRenderer?.dangerLevel = dangerLevel.floatValue
    radarRenderer?.themeVariant = themeVariant as String
    radarRenderer?.paused = radarPaused
    metalView.isPaused = radarPaused
  }
}
