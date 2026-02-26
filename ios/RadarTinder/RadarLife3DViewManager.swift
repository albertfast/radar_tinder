import Foundation
import React

@objc(RTRadarLife3DViewManager)
final class RTRadarLife3DViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    RadarLife3DView(frame: .zero)
  }
}
