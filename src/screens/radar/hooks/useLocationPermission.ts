import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  LocationPermissionStatus,
  LocationService,
} from '../../../services/LocationService';

export function useLocationPermission() {
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionStatus>('undetermined');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const refreshPermissionStatus = useCallback(async () => {
    const nextStatus = await LocationService.getForegroundPermissionStatus().catch(
      () => 'undetermined' as LocationPermissionStatus
    );
    setPermissionStatus((current) => (current === nextStatus ? current : nextStatus));
    return nextStatus;
  }, []);

  useEffect(() => {
    void refreshPermissionStatus();
  }, [refreshPermissionStatus]);

  useFocusEffect(
    useCallback(() => {
      void refreshPermissionStatus();
    }, [refreshPermissionStatus])
  );

  const requestLocationAccess = useCallback(async () => {
    setIsRequestingPermission(true);
    try {
      await LocationService.requestLocationPermission();
      setPermissionStatus('granted');
      return true;
    } catch {
      const nextStatus = await LocationService.getForegroundPermissionStatus().catch(
        () => 'denied' as LocationPermissionStatus
      );
      setPermissionStatus(nextStatus === 'granted' ? 'denied' : nextStatus);
      return false;
    } finally {
      setIsRequestingPermission(false);
    }
  }, []);

  return {
    permissionStatus,
    locationPermissionGranted: permissionStatus === 'granted',
    isRequestingPermission,
    refreshPermissionStatus,
    requestLocationAccess,
  };
}
