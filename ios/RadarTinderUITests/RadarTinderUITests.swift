//
//  RadarTinderUITests.swift
//  RadarTinderUITests
//
//  Created by Ahmet Sahiner on 3/2/26.
//

import XCTest

final class RadarTinderUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false

        app = XCUIApplication()
        app.launchArguments = ["-ui_testing"]
    }

    override func tearDownWithError() throws {
        app = nil
    }

    @MainActor
    func testAppLaunchesToForeground() throws {
        app.launch()
        XCTAssertEqual(app.state, .runningForeground)
    }

    @MainActor
    func testAppRelaunchesAfterBackgrounding() throws {
        app.launch()

        XCUIDevice.shared.press(.home)
        XCTAssertNotEqual(app.state, .notRunning)

        app.activate()
        XCTAssertEqual(app.state, .runningForeground)
    }

    @MainActor
    func testLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}
