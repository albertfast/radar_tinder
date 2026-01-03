/**
 * NOTE: To use this service, you need to install expo-av:
 * npx expo install expo-av
 */

// import { Audio } from 'expo-av';

export class SoundService {
  private static sound: any = null;
  private static isMuted: boolean = false;

  static async loadAlarm() {
    console.log('Alarm sound loading... (Requires expo-av)');
    // const { sound } = await Audio.Sound.createAsync(
    //   require('../../assets/alarm.mp3')
    // );
    // this.sound = sound;
  }

  static async playAlarm() {
    if (this.isMuted) return;
    console.log('Playing Radar Alarm Sound!');
    // if (this.sound) {
    //   await this.sound.replayAsync();
    // }
  }

  static setMute(muted: boolean) {
    this.isMuted = muted;
    console.log(`Sound is now ${muted ? 'MUTED' : 'UNMUTED'}`);
  }
}