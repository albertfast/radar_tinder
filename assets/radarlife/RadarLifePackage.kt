package com.radartinder.app.radarlife

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RadarLifePackage : ReactPackage {

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(RadarLife3DViewManager())
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return emptyList()
    }
}
