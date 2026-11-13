import type * as GeometryStore from '../settings/overlayGeometry';

describe('overlay geometry store', () => {
  let store: typeof GeometryStore;
  let storageData: Record<string, string>;
  const geometry = { top: 90, right: 40, width: 600, height: null };
  const key = 'craftbuddy_overlay_geometry';
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );

  beforeEach(() => {
    storageData = {};
    const storage: Storage = {
      getItem: (name) => storageData[name] ?? null,
      setItem: (name, value) => {
        storageData[name] = String(value);
      },
      removeItem: (name) => {
        delete storageData[name];
      },
      clear: () => {
        storageData = {};
      },
      key: (index) => Object.keys(storageData)[index] ?? null,
      get length() {
        return Object.keys(storageData).length;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    jest.isolateModules(() => {
      store = jest.requireActual<typeof GeometryStore>(
        '../settings/overlayGeometry',
      );
    });
  });

  afterEach(() => {
    if (originalStorage)
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('loads lazily, preserving unbounded intent and returning defensive copies', () => {
    storageData[key] = JSON.stringify({ version: 1, ...geometry, width: 8000 });
    expect(store.getManualOverlayGeometry()).toEqual({
      ...geometry,
      width: 8000,
    });
    store.getManualOverlayGeometry()!.width = 1;
    expect(store.getManualOverlayGeometry()!.width).toBe(8000);
  });

  it('persists and reloads the versioned schema', () => {
    store.saveManualOverlayGeometry(geometry);
    expect(JSON.parse(storageData[key])).toEqual({ version: 1, ...geometry });
    jest.isolateModules(() => {
      const reloaded = jest.requireActual<typeof GeometryStore>(
        '../settings/overlayGeometry',
      );
      expect(reloaded.getManualOverlayGeometry()).toEqual(geometry);
    });
  });

  it('notifies subscribers on save/reset and supports unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribeOverlayGeometry(listener);
    store.saveManualOverlayGeometry(geometry);
    expect(listener).toHaveBeenCalledTimes(1);
    store.resetOverlayGeometry();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getManualOverlayGeometry()).toBeNull();
    expect(storageData[key]).toBeUndefined();
    unsubscribe();
    store.saveManualOverlayGeometry(geometry);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it.each(['{broken', 'null', '{"version":2}', '{"version":1,"top":"90"}'])(
    'falls back to auto for corrupt storage: %s',
    (raw) => {
      storageData[key] = raw;
      expect(store.getManualOverlayGeometry()).toBeNull();
    },
  );

  it('keeps save and reset working when storage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    expect(store.getManualOverlayGeometry()).toBeNull();
    store.saveManualOverlayGeometry(geometry);
    expect(store.getManualOverlayGeometry()).toEqual(geometry);
    store.resetOverlayGeometry();
    expect(store.getManualOverlayGeometry()).toBeNull();
  });
});
