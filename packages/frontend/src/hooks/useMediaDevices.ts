import { useCallback, useEffect, useState } from 'react';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface MediaDeviceState {
  cameras: DeviceOption[];
  microphones: DeviceOption[];
  activeCamera: string;
  activeMicrophone: string;
  setActiveCamera: (deviceId: string) => void;
  setActiveMicrophone: (deviceId: string) => void;
  refresh: () => Promise<void>;
}

/**
 * The cameras and microphones this browser will let us use.
 *
 * Labels are empty until the user has granted permission at least once — the
 * browser withholds them to stop a page fingerprinting the machine before
 * consent — so a device that has not been authorised yet shows a positional
 * fallback rather than a blank entry.
 */
export function useMediaDevices(enabled: boolean): MediaDeviceState {
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [activeCamera, setActiveCamera] = useState('');
  const [activeMicrophone, setActiveMicrophone] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    if (
      typeof navigator === 'undefined' ||
      navigator.mediaDevices === undefined
    )
      return;

    const devices = await navigator.mediaDevices.enumerateDevices();

    const collect = (kind: MediaDeviceKind, noun: string): DeviceOption[] =>
      devices
        .filter((device) => device.kind === kind && device.deviceId !== '')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label !== '' ? device.label : `${noun} ${index + 1}`,
        }));

    const nextCameras = collect('videoinput', 'Camera');
    const nextMicrophones = collect('audioinput', 'Microphone');

    setCameras(nextCameras);
    setMicrophones(nextMicrophones);
    // Default to whatever the browser already picked, so the control opens
    // showing the device actually in use rather than an empty selection.
    setActiveCamera((current) =>
      current !== '' ? current : (nextCameras[0]?.deviceId ?? '')
    );
    setActiveMicrophone((current) =>
      current !== '' ? current : (nextMicrophones[0]?.deviceId ?? '')
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();

    // Plugging in a headset mid-call should show up without a reload.
    const devices = navigator.mediaDevices;
    if (devices === undefined) return;
    const onChange = (): void => {
      void refresh();
    };
    devices.addEventListener('devicechange', onChange);
    return () => devices.removeEventListener('devicechange', onChange);
  }, [enabled, refresh]);

  return {
    cameras,
    microphones,
    activeCamera,
    activeMicrophone,
    setActiveCamera,
    setActiveMicrophone,
    refresh,
  };
}
