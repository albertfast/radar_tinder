/** Production AdMob IDs from Play Console / AdMob dashboard (Radar Tinder). */
export const ADMOB_ANDROID_APP_ID = 'ca-app-pub-9670547831022880~5105162950';
export const ADMOB_IOS_APP_ID = 'ca-app-pub-9670547831022880~2252519276';

export const ADMOB_PRODUCTION_UNITS = {
  android: {
    /** radartinderfirstad */
    banner: 'ca-app-pub-9670547831022880/8900297100',
    /** openingapp */
    appOpen: 'ca-app-pub-9670547831022880/6689341744',
    /** radartinder_fullscreen_once_any_button_is_clicked */
    interstitialGeneral: 'ca-app-pub-9670547831022880/8944445352',
    /** radartinder_fullscreen_start_driving_button */
    interstitialStartDriving: 'ca-app-pub-9670547831022880/6318282017',
    /** flex (adaptive / locked feature gate) */
    adaptiveFlex: 'ca-app-pub-9670547831022880/5261007755',
  },
  ios: {
    banner: 'ca-app-pub-9670547831022880/8900297100',
    appOpen: 'ca-app-pub-9670547831022880/5005200341',
    interstitialGeneral: 'ca-app-pub-9670547831022880/3380652121',
    interstitialStartDriving: 'ca-app-pub-9670547831022880/2067570457',
    adaptiveFlex: 'ca-app-pub-9670547831022880/5261007755',
  },
} as const;
