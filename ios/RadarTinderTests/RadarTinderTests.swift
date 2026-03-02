//
//  RadarTinderTests.swift
//  RadarTinderTests
//
//  Created by Ahmet Sahiner on 3/2/26.
//

import Foundation
import Testing
@testable import RadarTinder

struct RadarTinderTests {
    @Test("App bundle has version and build numbers")
    func appBundleHasVersionAndBuild() throws {
        let appBundle = Bundle(for: AppDelegate.self)
        let version = appBundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let build = appBundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String

        #expect((version ?? "").isEmpty == false)
        #expect((build ?? "").isEmpty == false)
    }

    @Test("App bundle identifier is present")
    func appBundleIdentifierIsPresent() throws {
        let appBundle = Bundle(for: AppDelegate.self)
        let bundleIdentifier = appBundle.bundleIdentifier

        #expect((bundleIdentifier ?? "").isEmpty == false)
    }
}
