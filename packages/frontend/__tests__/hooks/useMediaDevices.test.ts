import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaDevices } from '../../src/hooks/useMediaDevices';

function setDevices(devices: Partial<MediaDeviceInfo>[]): void {
  (
    navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>
  ).mockResolvedValue(devices);
}

beforeEach(() => {
  vi.clearAllMocks();
  setDevices([]);
});

describe('useMediaDevices', () => {
  it('does not enumerate until it is enabled', async () => {
    renderHook(() => useMediaDevices(false));

    expect(navigator.mediaDevices.enumerateDevices).not.toHaveBeenCalled();
  });

  it('splits cameras from microphones', async () => {
    setDevices([
      { kind: 'videoinput', deviceId: 'cam1', label: 'Front camera' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'Headset' },
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Speakers' },
    ]);

    const { result } = renderHook(() => useMediaDevices(true));

    await waitFor(() => expect(result.current.cameras).toHaveLength(1));
    expect(result.current.cameras[0].label).toBe('Front camera');
    expect(result.current.microphones).toHaveLength(1);
    // Output devices are not switchable here and must not appear as inputs.
    expect(result.current.microphones[0].deviceId).toBe('mic1');
  });

  it('names a device the browser has not labelled yet', async () => {
    // Labels stay empty until permission has been granted at least once, and
    // a blank entry in the picker is unusable.
    setDevices([
      { kind: 'videoinput', deviceId: 'cam1', label: '' },
      { kind: 'videoinput', deviceId: 'cam2', label: '' },
    ]);

    const { result } = renderHook(() => useMediaDevices(true));

    await waitFor(() => expect(result.current.cameras).toHaveLength(2));
    expect(result.current.cameras.map((c) => c.label)).toEqual([
      'Camera 1',
      'Camera 2',
    ]);
  });

  it('drops entries with no id, which cannot be selected', async () => {
    setDevices([
      { kind: 'videoinput', deviceId: '', label: 'Blocked' },
      { kind: 'videoinput', deviceId: 'cam1', label: 'Usable' },
    ]);

    const { result } = renderHook(() => useMediaDevices(true));

    await waitFor(() => expect(result.current.cameras).toHaveLength(1));
    expect(result.current.cameras[0].deviceId).toBe('cam1');
  });

  it('defaults the selection to the first device, so the picker opens on the one in use', async () => {
    setDevices([
      { kind: 'videoinput', deviceId: 'cam1', label: 'A' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'B' },
    ]);

    const { result } = renderHook(() => useMediaDevices(true));

    await waitFor(() => expect(result.current.activeCamera).toBe('cam1'));
    expect(result.current.activeMicrophone).toBe('mic1');
  });

  it('keeps an explicit choice when the device list is refreshed', async () => {
    setDevices([
      { kind: 'videoinput', deviceId: 'cam1', label: 'A' },
      { kind: 'videoinput', deviceId: 'cam2', label: 'B' },
    ]);

    const { result } = renderHook(() => useMediaDevices(true));
    await waitFor(() => expect(result.current.cameras).toHaveLength(2));

    result.current.setActiveCamera('cam2');
    await waitFor(() => expect(result.current.activeCamera).toBe('cam2'));

    // Plugging in a headset triggers a refresh; it must not reset the choice.
    await result.current.refresh();
    await waitFor(() => expect(result.current.activeCamera).toBe('cam2'));
  });

  it('listens for devices being plugged in or removed', async () => {
    renderHook(() => useMediaDevices(true));

    await waitFor(() =>
      expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      )
    );
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = renderHook(() => useMediaDevices(true));
    await waitFor(() =>
      expect(navigator.mediaDevices.addEventListener).toHaveBeenCalled()
    );

    unmount();

    expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith(
      'devicechange',
      expect.any(Function)
    );
  });
});
