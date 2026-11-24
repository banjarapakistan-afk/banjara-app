const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function hooks() {
  let cursor = 0,
    effects = [];
  const slots = [];
  const same = (a, b) =>
    a &&
    b &&
    a.length === b.length &&
    a.every((value, i) => Object.is(value, b[i]));
  const api = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps))
        slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return api.useMemo(() => fn, deps);
    },
    // Screens now reach hooks/useBackendData; a synchronous read is enough here.
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  return {
    api,
    render(fn) {
      cursor = 0;
      const tree = fn();
      const pending = effects;
      effects = [];
      pending.forEach((fn) => fn());
      return tree;
    },
  };
}

const validTransport = {
  businessName: 'Test Transport',
  ownerName: 'Test Owner',
  vehicleClass: 'van',
  vehicleTypes: ['van'],
  vehicleCount: 1,
  ownershipType: 'owned',
  operatingCities: [],
  operatingRoutes: [],
  pickupLocations: [],
  dropoffLocations: [],
  description: '',
  pricingMethod: 'per_seat',
  priceAmount: 4500,
  pricePercent: 20,
  vehicleModel: 'Toyota Hiace',
  vehicleMakeYear: '2022',
  engineNumber: 'ENGINE-001',
  registrationNumber: 'TEST-123',
  driverName: 'Test Driver',
  driverPhone: '03001234567',
  driverEmail: '',
  driverPermanentAddress: 'Test Road Islamabad',
  driverCnic: '35202-7654321-1',
  driverLicenseNumber: 'LICENSE-123',
  driverExperienceYears: '0',
  driverEmergencyContact: '03007654321',
  hasInsurance: 'yes',
  insuranceCompany: 'Test Insurance',
  insuranceNumber: 'POLICY-123',
  insuranceYear: String(new Date().getFullYear()),
  vehicleImageFront: 'https://example.com/front.jpg',
  vehicleImageBack: 'https://example.com/back.jpg',
};
const profile = (step = 'transport') => ({
  id: 'provider-1',
  userId: 'user-1',
  services: ['transport'],
  verificationStatus: 'pending',
  businessName: 'Test Transport',
  ownerName: 'Test Owner',
  phone: '03001234567',
  email: 'test@example.com',
  city: 'Islamabad',
  address: 'Test Road Islamabad',
  latitude: 33.68,
  longitude: 73.04,
  description: 'Test transport service',
  yearsExperience: 0,
  documents: [],
  transport: { ...validTransport },
  onboardingProgress: { nextStep: step, completed: step === 'submitted' },
});
const vehicle = () => ({
  id: 'vehicle-1',
  providerId: 'provider-1',
  name: 'Primary Hiace',
  type: 'van',
  model: 'Toyota Hiace',
  year: 2022,
  registrationNumber: 'TEST-123',
  totalSeats: 8,
  amenities: [],
  images: [validTransport.vehicleImageFront, validTransport.vehicleImageBack],
  active: false,
  status: 'pending',
  verificationDetails: { ...validTransport },
});

function runtime(storage = new Map()) {
  const runner = hooks(),
    cache = new Map(),
    routes = [],
    alerts = [],
    calls = [];
  const auth = {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      role: 'provider',
      providerId: 'provider-1',
      name: 'Test Owner',
      phone: '03001234567',
      email: 'test@example.com',
    },
    token: 'valid-token',
  };
  auth.updateProviderLink = (providerId, providerStatus) => {
    auth.user = { ...auth.user, role: 'provider', providerId, providerStatus };
  };
  const authStore = Object.assign((selector) => selector(auth), {
    getState: () => auth,
    persist: { hasHydrated: () => true },
  });
  const service = {
    getProviderByUserId: async () => profile(),
    getProviderVehicles: async () => [vehicle()],
    saveProviderProgress: async (draft) => {
      calls.push(['save', draft]);
      return { ...profile(), transport: draft.transport };
    },
    saveOnboardingCheckpoint: async (step) => {
      calls.push(['checkpoint', step]);
      return profile(
        step === 'transport'
          ? 'vehicle'
          : step === 'vehicle'
            ? 'verification'
            : 'transport',
      );
    },
    submitProviderApplication: async () => profile('submitted'),
    updateVehicle: async (id, body) => {
      calls.push(['vehicle', id, body]);
      return { ...body, id };
    },
    createVehicle: async (body) => {
      calls.push(['createVehicle', body]);
      return { ...body, id: 'new-vehicle' };
    },
  };
  const jsx = (type, props) => ({ type, props });
  const rn = {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (value) => value },
    Alert: { alert: (...values) => alerts.push(values) },
    View: 'View',
    Text: 'Text',
    ScrollView: 'ScrollView',
    Pressable: 'Pressable',
    Switch: 'Switch',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    ActivityIndicator: 'Spinner',
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    AppState: { addEventListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
  };
  const mocks = {
    react: runner.api,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': rn,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => {
        storage.set(key, value);
      },
      removeItem: async (key) => storage.delete(key),
    },
    '@/services/providerService': service,
    '@/services/apiError': { getApiErrorMessage: (error) => error.message },
    // These tests are about navigation: the API is always reachable.
    '@/services/backendAvailability': {
      backendAvailability: {
        getSnapshot: () => 'online',
        subscribe: () => () => {},
        getEpoch: () => 0,
        check: async () => {},
        registerReset: () => () => {},
        reportFailure: () => {},
      },
    },
    // SDK 58 ships expo-modules-core as ESM, which plain Node can't require.
    'expo-constants': { __esModule: true, default: {} },
    'expo-device': { isDevice: false },
    '@/store/authStore': { useAuthStore: authStore },
    'expo-router': {
      router: {
        push: (href) => routes.push(href),
        replace: (href) => routes.push(href),
        back: () => routes.push('back'),
      },
      useLocalSearchParams: () => params,
      useNavigation: () => ({ setOptions() {}, addListener: () => () => {} }),
      useSegments: () => segments,
      Redirect: 'Redirect',
      Stack: Object.assign('Stack', { Screen: 'Screen' }),
    },
    'react-native-safe-area-context': {
      useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
    },
    '@/constants/colors': { Colors: {}, useThemeColors: () => ({}) },
    '@/constants/spacing': { Spacing: { lg: 20, md: 12, sm: 8 }, Radius: {} },
    '@/constants/typography': { Fonts: {}, Typography: {} },
    '@/hooks/useThemedStackOptions': { useThemedStackOptions: () => ({}) },
    '@/utils/navigation': {
      paramId: (value) => (Array.isArray(value) ? value[0] : value || ''),
      useWizardBack: (fn) => fn,
      useBlockBack: () => {},
      wizardBack: (href) => routes.push(href),
      leaveProviderEditor: () => routes.push('editor'),
      pushPath: (href) => routes.push(href),
    },
    '@/services/uploadService': {
      pickImages: async () => [],
      uploadImages: async () => [],
    },
    '@/services/serviceCatalogService': {
      listActiveServices: async () => [],
      getProviderCounts: async () => ({
        services: { transport: { approved: 8, registered: 9 } },
        total: { approved: 8, registered: 9 },
      }),
    },
    '@/components/location': { LocationPinField: 'LocationPinField' },
    '@/components/provider/VehicleVerificationFields': {
      VehicleVerificationFields: 'VehicleVerificationFields',
    },
    '@/components/provider/RouteStopFields': {
      RouteStopFields: 'RouteStopFields',
    },
    '@/components/ui/EmptyState': { LoadingState: 'LoadingState' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/provider/TransportSignupSteps': {
      TransportSignupSteps: 'TransportSignupSteps',
    },
  };
  for (const name of [
    'Button',
    'Header',
    'Input',
    'SearchSelect',
    'ImagePickerField',
    'PlaceAutocompleteSelect',
  ])
    mocks[`@/components/ui/${name}`] = { [name]: name };
  let params = {},
    segments = ['(provider)', 'register', 'transport'];
  function load(relative) {
    const full = path.resolve(root, relative);
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} };
    cache.set(full, module);
    const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      fileName: full,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const customRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) {
        const base = name.slice(2),
          extension = fs.existsSync(path.join(root, `${base}.ts`))
            ? '.ts'
            : '.tsx';
        return load(`${base}${extension}`);
      }
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
      filename: full,
    })(customRequire, module, module.exports);
    return module.exports;
  }
  const store = load('store/providerStore.ts').useProviderStore;
  const selectStore = Object.assign(
    (selector) => selector(store.getState()),
    store,
  );
  mocks['@/store/providerStore'] = { useProviderStore: selectStore };
  return {
    runner,
    load,
    store,
    service,
    auth,
    storage,
    routes,
    alerts,
    calls,
    mocks,
    rn,
    params: (value) => {
      params = value;
    },
    segments: (value) => {
      segments = value;
    },
  };
}
function nodes(tree) {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.type === 'Controller') {
    const { control, name, render } = tree.props;
    return nodes(
      render({
        field: {
          value: control.values[name],
          onChange: (value) => control.set(name, value),
        },
      }),
    );
  }
  return typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function find(tree, type, label) {
  const result = nodes(tree).find(
    (node) =>
      node.type === type &&
      (node.props.label === label || node.props.title === label),
  );
  assert.ok(result, `Missing ${type}: ${label}`);
  return result.props;
}

test('profile refresh does not repeatedly refocus the dashboard when the user object changes', async () => {
  const env = runtime(); await flush();
  let profileReads = 0, focusLoads = 0;
  env.service.getProviderByUserId = async () => { profileReads++; return profile('submitted'); };
  env.mocks['expo-router'].useFocusEffect = callback => env.runner.api.useEffect(callback, [callback]);
  env.mocks['@/services/paymentAccountsCache'] = {
    peekPaymentAccountsCache: () => ({ hasActive: true }), paymentAccountsCacheAgeMs: () => 0,
    invalidatePaymentAccountsCache() {}, getPaymentAccountsStatus: async () => ({ hasActive: true }),
  };
  const { usePaymentAccountsGate } = env.load('hooks/usePaymentAccountsGate.ts');
  function FocusedDashboard() {
    const { recheck } = usePaymentAccountsGate();
    env.runner.api.useEffect(() => {
      focusLoads++;
      void env.store.getState().loadProviderByUser('user-1').then(recheck);
    }, [recheck]);
  }
  for (let i = 0; i < 6; i++) { env.runner.render(FocusedDashboard); await flush(); }
  assert.equal(profileReads, 1, 'One focused dashboard visit must not keep reloading the provider');
  assert.equal(focusLoads, 1);
});

test('unchanged provider metadata preserves the auth user and does not notify subscribers', async () => {
  const env = runtime();
  env.mocks['@/services/authService'] = {};
  env.mocks['@/services/api'] = { writeAuthTokens: async () => {}, clearAuthSession: async () => {} };
  env.mocks['@/services/authToken'] = { setMemoryAuthTokens() {} };
  const store = env.load('store/authStore.ts').useAuthStore;
  await store.persist.rehydrate();
  store.setState({ user: { ...env.auth.user, providerStatus: 'pending' } });
  const user = store.getState().user;
  let changes = 0;
  const stop = store.subscribe(() => changes++);
  store.getState().updateProviderLink('provider-1', 'pending');
  store.getState().updateProviderLink('provider-1', 'pending');
  assert.equal(store.getState().user, user);
  assert.equal(changes, 0);
  store.getState().updateProviderLink('provider-1', 'approved');
  assert.equal(store.getState().user.providerStatus, 'approved');
  assert.equal(changes, 1);
  stop();
});

test('a submitted provider settles on status after dashboard Back and service-tab navigation', async () => {
  const env = runtime(); await flush();
  env.service.getProviderByUserId = async () => profile('submitted');
  env.store.setState({ provider: profile('submitted'), profileLoadedFor: 'user-1', draftUserId: 'user-1' });
  const Layout = env.load('app/(provider)/_layout.tsx').default;
  for (const target of ['index', 'services']) {
    env.segments(['(provider)', '(tabs)', target]);
    let tree = env.runner.render(Layout);
    assert.equal(tree.type, 'Redirect');
    assert.equal(tree.props.href, '/(provider)/status');
    env.segments(['(provider)', 'status']);
    for (let i = 0; i < 4; i++) {
      tree = env.runner.render(Layout);
      assert.notEqual(tree.type, 'Redirect', 'Status must remain mounted while approval is pending');
      await flush();
    }
  }
});

test('draft edits survive store rehydration and cannot leak into a different account', async () => {
  const first = runtime();
  await flush();
  first.store.setState({ draftUserId: 'user-1' });
  first.store
    .getState()
    .setFormDraft('transport.form', {
      driverName: 'Unfinished driver',
      engineNumber: '',
    });
  first.store.getState().setSelectedServices(['transport']);
  await flush();
  const reopened = runtime(first.storage);
  await reopened.store.persist.rehydrate();
  assert.equal(
    reopened.store.getState().formDrafts['transport.form'].driverName,
    'Unfinished driver',
  );
  assert.equal(
    reopened.store.getState().provider,
    null,
    'Server completion must not be cached as verified',
  );
  reopened.auth.user = { id: 'different-user', role: 'provider' };
  reopened.service.getProviderByUserId = async () => null;
  await reopened.store.getState().loadProviderByUser('different-user');
  assert.deepEqual(reopened.store.getState().formDrafts, {});
  assert.deepEqual(reopened.store.getState().draft.selectedServices, []);
});

test('saving missing required details or an unsigned session rejects instead of returning a false success', async () => {
  const env = runtime();
  await flush();
  await assert.rejects(env.store.getState().saveProgress(), /Business Info/);
  assert.equal(env.calls.length, 0);
  env.auth.token = 'guest-token';
  await assert.rejects(env.store.getState().saveProgress(), /sign in/);
});

test('a stale profile response cannot replace a newer saved checkpoint', async () => {
  const env = runtime();
  await flush();
  const pending = deferred();
  env.service.getProviderByUserId = () => pending.promise;
  const loading = env.store.getState().loadProviderByUser('user-1');
  await env.store.getState().checkpoint('transport');
  pending.resolve(profile('location'));
  await loading;
  assert.equal(
    env.store.getState().provider.onboardingProgress.nextStep,
    'vehicle',
  );
  assert.equal(env.store.getState().loading, false);
});

test('newer profile loads win and responses after logout are ignored', async () => {
  const env = runtime();
  await flush();
  const pending = deferred();
  env.service.getProviderByUserId = () => pending.promise;
  const old = env.store.getState().loadProviderByUser('user-1');
  env.service.getProviderByUserId = async () => profile('vehicle');
  await env.store.getState().loadProviderByUser('user-1');
  pending.resolve(profile('transport'));
  await old;
  assert.equal(
    env.store.getState().provider.onboardingProgress.nextStep,
    'vehicle',
  );
  const logoutRead = deferred();
  env.service.getProviderByUserId = () => logoutRead.promise;
  const request = env.store.getState().loadProviderByUser('user-1');
  env.store.getState().clearSession();
  env.auth.user = null;
  logoutRead.resolve(profile('submitted'));
  await request;
  assert.equal(env.store.getState().provider, null);
});

test('resume routing and the dashboard gate follow authoritative progress, including no profile and no progress response', async () => {
  const env = runtime();
  await flush();
  const routes = env.load('utils/providerOnboarding.ts');
  const draft = env.store.getState().draft;
  assert.equal(
    routes.transportResumeStep(null, {
      ...draft,
      selectedServices: ['transport'],
    }),
    'business',
  );
  assert.equal(
    routes.transportResumeStep(
      { ...profile(), onboardingProgress: undefined },
      draft,
    ),
    'business',
  );
  for (const step of [
    'business',
    'location',
    'transport',
    'vehicle',
    'verification',
    'review',
    'submitted',
  ]) {
    assert.equal(routes.transportResumeStep(profile(step), draft), step);
    assert.equal(routes.transportDashboardAllowed(profile(step)), false);
  }
  assert.equal(
    routes.transportDashboardAllowed({
      ...profile('submitted'),
      verificationStatus: 'approved',
    }),
    true,
  );
  assert.equal(
    routes.transportResumeStep({ ...profile(), services: ['hotel'] }, draft),
    null,
  );
});

test('the provider layout blocks dashboard/deep-link bypass, allows back navigation, and blocks unknown restored progress', async () => {
  const env = runtime();
  await flush();
  const Layout = env.load('app/(provider)/_layout.tsx').default;
  env.store.setState({
    provider: profile('vehicle'),
    profileLoadedFor: 'user-1',
    draftUserId: 'user-1',
  });
  env.segments(['(provider)', '(tabs)']);
  let tree = env.runner.render(Layout);
  assert.equal(tree.type, 'Redirect');
  // Vehicle details and the vehicle record share one signup screen.
  assert.equal(tree.props.href, '/(provider)/register/transport');
  env.segments(['(provider)', 'register', 'review']);
  tree = env.runner.render(Layout);
  assert.equal(tree.type, 'Redirect');
  env.segments(['(provider)', 'register', 'transport']);
  tree = env.runner.render(Layout);
  assert.notEqual(tree.type, 'Redirect');
  env.store.setState({
    profileLoadedFor: null,
    provider: profile('submitted'),
  });
  env.segments(['(provider)', '(tabs)']);
  tree = env.runner.render(Layout);
  assert.notEqual(tree.type, 'Redirect');
  assert.ok(nodes(tree).some((node) => node.type === 'Spinner'));
});

test('the one vehicle step asks no driver or CNIC questions, validates, and saves vehicle + record before the CNIC step', async () => {
  const env = runtime();
  await flush();
  await env.store.getState().loadProviderByUser('user-1');
  env.store.setState({ vehicles: [vehicle()] });
  const Screen = env.load('app/(provider)/register/transport.tsx').default;
  let tree = env.runner.render(Screen);
  const labels = nodes(tree)
    .filter((node) => node.type === 'Input')
    .map((node) => node.props.label);
  for (const asked of labels)
    assert.doesNotMatch(asked, /CNIC|phone|emergency|address/i, `Step 3 must not re-ask "${asked}"`);
  // The driving licence belongs with the vehicle on this step (prefilled when already saved).
  assert.equal(find(tree, 'Input', 'Your driving licence number').value, 'LICENSE-123');
  assert.equal(find(tree, 'Input', 'Make & model').value, 'Toyota Hiace');
  find(tree, 'Input', 'Make & model').onChangeText('');
  tree = env.runner.render(Screen);
  await find(tree, 'Button', 'Save vehicle & continue').onPress();
  assert.equal(env.routes.length, 0);
  assert.match(env.alerts.at(-1).join(' '), /Vehicle model/);
  find(tree, 'Input', 'Make & model').onChangeText('Toyota Hiace');
  tree = env.runner.render(Screen);
  const checkpoint = deferred();
  env.service.saveOnboardingCheckpoint = (step) => {
    env.calls.push(['checkpoint', step]);
    return step === 'transport' ? checkpoint.promise : Promise.resolve(profile('verification'));
  };
  const next = find(tree, 'Button', 'Save vehicle & continue').onPress();
  await flush();
  assert.equal(env.routes.length, 0, 'Must wait for the checkpoint');
  checkpoint.resolve(profile('vehicle'));
  await next;
  await flush();
  const saved = env.calls.find((call) => call[0] === 'vehicle');
  assert.equal(saved[1], 'vehicle-1', 'Must update the signup vehicle instead of creating a duplicate');
  assert.equal(saved[2].totalSeats, 8);
  assert.equal(saved[2].verificationDetails.engineNumber, 'ENGINE-001');
  assert.equal(saved[2].verificationDetails.driverLicenseNumber, 'LICENSE-123');
  assert.deepEqual(
    env.calls.filter((call) => call[0] === 'checkpoint').map((call) => call[1]),
    ['transport', 'vehicle'],
  );
  assert.equal(env.routes.at(-1), '/(provider)/register/verification', JSON.stringify(env.alerts));
});

test('old Add Vehicle signup links land on the vehicle step', async () => {
  const env = runtime();
  await flush();
  await env.store.getState().loadProviderByUser('user-1');
  env.params({ mode: 'onboarding' });
  const Screen = env.load('app/(provider)/vehicles/add.tsx').default;
  const tree = env.runner.render(Screen);
  assert.equal(tree.type, 'Redirect');
  assert.equal(tree.props.href, '/(provider)/register/transport');
});

test('vehicle save failures keep the user and their draft on the same step', async () => {
  const env = runtime();
  await flush();
  await env.store.getState().loadProviderByUser('user-1');
  env.store.setState({ vehicles: [vehicle()] });
  env.service.updateVehicle = async () => {
    throw new Error('Offline');
  };
  const Screen = env.load('app/(provider)/register/transport.tsx').default;
  let tree = env.runner.render(Screen);
  find(tree, 'Input', 'Make & model').onChangeText('Toyota Hiace Grand');
  tree = env.runner.render(Screen);
  await find(tree, 'Button', 'Save vehicle & continue').onPress();
  for (let i = 0; i < 5; i++) await flush();
  assert.equal(env.routes.length, 0);
  assert.equal(
    env.store.getState().formDrafts['vehicleStep.form'].vehicleModel,
    'Toyota Hiace Grand',
  );
  assert.match(env.alerts.at(-1).join(' '), /Offline/);
});

test('Transportation selection opens Business Info, including when resuming a pending profile', async () => {
  const env = runtime();
  await flush();
  env.auth.user.providerId = undefined;
  env.service.getProviderByUserId = async () => null;
  const Screen = env.load('app/(provider)/register/services.tsx').default;
  env.runner.render(Screen);
  await flush();
  env.store.getState().setSelectedServices(['transport']);
  let tree = env.runner.render(Screen);
  // Real provider numbers from the API show on the service cards.
  const pills = nodes(tree).filter((n) => n.props && Object.prototype.hasOwnProperty.call(n.props, 'count'));
  assert.ok(pills.some((p) => p.props.count?.registered === 9), 'Transport card must show the real count');
  assert.ok(pills.some((p) => !p.props.count), 'Services with nobody yet show an invitation');
  find(tree, 'Button', 'Continue').onPress();
  assert.equal(env.routes.at(-1), '/(provider)/register/business');
  env.store.setState({ provider: profile('transport') });
  tree = env.runner.render(Screen);
  find(tree, 'Button', 'Continue').onPress();
  assert.equal(env.routes.at(-1), '/(provider)/register/business');
  assert.ok(
    !nodes(tree).some(
      (node) => node.type === 'Button' && /^Edit /.test(node.props.title),
    ),
  );
});

test('Driver details validate required fields, save edits as typed, and save before opening the map', async () => {
  const env = runtime();
  await flush();
  env.store.getState().setSelectedServices(['transport']);
  env.mocks['react-hook-form'] = {
    Controller: 'Controller',
    useForm(options) {
      const ref = env.runner.api.useRef(null);
      if (!ref.current) {
        const state = {
          values: { ...options.defaultValues },
          listeners: new Set(),
          errors: {},
        };
        state.set = (name, value) => {
          state.values[name] = value;
          state.listeners.forEach((fn) => fn({ ...state.values }));
        };
        ref.current = state;
      }
      const state = ref.current;
      return {
        control: state,
        formState: { errors: state.errors },
        setValue: state.set,
        watch: (fn) => {
          if (Array.isArray(fn)) return fn.map((name) => state.values[name]);
          state.listeners.add(fn);
          return { unsubscribe: () => state.listeners.delete(fn) };
        },
        handleSubmit: (callback) => async () => {
          const result = await options.resolver(state.values, {}, {});
          Object.assign(state.errors, result.errors);
          if (!Object.keys(result.errors).length) await callback(result.values);
        },
      };
    },
  };
  const Screen = env.load('app/(provider)/register/business.tsx').default;
  let tree = env.runner.render(Screen);
  // Name, phone and email come from the account: shown as a summary, not asked again.
  assert.ok(
    !nodes(tree).some((node) => node.type === 'Input' && node.props.label === 'Full name (as on your CNIC)'),
  );
  const edit = nodes(tree).find((node) => node.props?.accessibilityLabel === 'Edit name, phone and email');
  assert.ok(edit, 'Account summary must offer Edit');
  edit.props.onPress();
  tree = env.runner.render(Screen);
  assert.equal(find(tree, 'Input', 'Full name (as on your CNIC)').value, 'Test Owner');
  await find(tree, 'Button', 'Continue to location').onPress();
  assert.equal(env.routes.length, 0);
  assert.equal(env.calls.length, 0);
  for (const [label, value] of [
    ['Full name (as on your CNIC)', 'Ayesha Khan'],
    ['About you', 'I drive the Karakoram Highway every week'],
    ['Driving experience (years)', '0'],
    ['Emergency contact number', '03110000000'],
  ]) {
    find(tree, 'Input', label).onChangeText(value);
  }
  // Step 1 asks about the person only: no licence (vehicle step) and no routes (dashboard, after approval).
  assert.ok(!nodes(tree).some((node) => /licen/i.test(String(node.props?.label ?? ''))));
  assert.ok(!nodes(tree).some((node) => Array.isArray(node.props?.routes)));
  find(tree, 'PlaceAutocompleteSelect', 'Based in').onChange('Hunza', {
    name: 'Karimabad',
    address: { city: 'Hunza' },
  });
  // Permanent address comes from the place search and keeps the full address.
  find(tree, 'PlaceAutocompleteSelect', 'Permanent address').onChange('Karimabad', {
    name: 'Karimabad',
    address: { city: 'Hunza', formattedAddress: 'Karimabad, Hunza, Gilgit-Baltistan, Pakistan' },
  });
  assert.equal(
    env.store.getState().formDrafts.business.ownerName,
    'Ayesha Khan',
  );
  tree = env.runner.render(Screen);
  await find(tree, 'Button', 'Continue to location').onPress();
  const savedDraft = env.calls.find((call) => call[0] === 'save')[1];
  const saved = savedDraft.business;
  assert.equal(saved.yearsExperience, 0);
  // Rides are offered by individual drivers: the listing name is the driver's own name.
  assert.equal(saved.ownerName, 'Ayesha Khan');
  assert.equal(saved.businessName, 'Ayesha Khan');
  // The same answers fill the driver record, so the vehicle step never asks for them.
  assert.equal(savedDraft.transport.driverName, 'Ayesha Khan');
  assert.equal(savedDraft.transport.driverEmergencyContact, '03110000000');
  assert.equal(savedDraft.transport.driverPermanentAddress, 'Karimabad, Hunza, Gilgit-Baltistan, Pakistan');
  assert.equal(env.routes.at(-1).pathname, '/(provider)/location');
});

test('transport form values and uploaded photos are restored after a complete store/component restart', async () => {
  const env = runtime();
  await flush();
  await env.store.getState().loadProviderByUser('user-1');
  let Screen = env.load('app/(provider)/register/transport.tsx').default;
  let tree = env.runner.render(Screen);
  find(tree, 'Input', 'Engine number').onChangeText('ENGINE-NEW');
  env.store
    .getState()
    .setFormDraft('vehicleStep.photos', [
      'https://example.com/unfinished-front.jpg',
      '',
    ]);
  await flush();
  const reopened = runtime(env.storage);
  await reopened.store.persist.rehydrate();
  await reopened.store.getState().loadProviderByUser('user-1');
  Screen = reopened.load('app/(provider)/register/transport.tsx').default;
  tree = reopened.runner.render(Screen);
  assert.equal(find(tree, 'Input', 'Engine number').value, 'ENGINE-NEW');
  assert.ok(
    nodes(tree).some(
      (node) =>
        node.type === 'ImagePickerField' &&
        node.props.urls.includes('https://example.com/unfinished-front.jpg'),
    ),
  );
});

test('identity drafts serialize writes, restore after reload, separate accounts, and clear on completion', async () => {
  const env = runtime();
  const encrypted = new Map();
  env.mocks['expo-secure-store'] = {
    getItemAsync: async (key) => encrypted.get(key),
    setItemAsync: async (key, value) => {
      encrypted.set(key, value);
    },
    deleteItemAsync: async (key) => {
      encrypted.delete(key);
    },
  };
  const storage = env.load('services/identityDraft.ts');
  const draft = {
    ...storage.emptyIdentityDraft(),
    cnicNumber: '35202-1234567-1',
    frontUri: 'file:///test-front.jpg',
  };
  const first = storage.saveIdentityDraft('user-1', draft);
  const latest = storage.saveIdentityDraft('user-1', {
    ...draft,
    fatherName: 'Saved father name',
  });
  await Promise.all([first, latest]);
  assert.equal(
    (await storage.loadIdentityDraft('user-1')).fatherName,
    'Saved father name',
  );
  assert.equal((await storage.loadIdentityDraft('user-2')).cnicNumber, '');
  await storage.clearIdentityDraft('user-1');
  assert.equal((await storage.loadIdentityDraft('user-1')).frontUri, '');
  assert.ok(
    !env.storage.get('banjara-provider')?.includes('1234567'),
    'Identity draft must not enter ordinary AsyncStorage',
  );
  assert.equal(
    require('../package.json').dependencies['expo-secure-store'],
    require('expo/bundledNativeModules.json')['expo-secure-store'],
  );
});

test('the real CNIC screen lets unverified drivers skip for now and restores verified progress before review', async () => {
  const env = runtime(); await flush();
  const saved = new Map();
  env.mocks['expo-secure-store'] = {
    getItemAsync: async key => saved.get(key), setItemAsync: async (key, value) => saved.set(key, value),
    deleteItemAsync: async key => saved.delete(key),
  };
  env.mocks['@expo/vector-icons'] = { Ionicons: 'Icon' };
  env.mocks['@/components/provider/CnicCropModal'] = { CnicCropModal: 'CnicCropModal' };
  env.mocks['@/components/provider/CnicImageField'] = { CnicImageField: 'CnicImageField' };
  const verification = { verifyCnic: async () => ({ verified: false, status: 'failed' }) };
  env.mocks['@/services/cnicVerification.service'] = verification;
  const identityStore = env.load('services/identityDraft.ts');
  await identityStore.saveIdentityDraft('user-1', {
    cnicNumber: '35202-1234567-1', fatherName: 'MUHAMMAD ALI', expiryDate: '15.08.2031',
    frontUri: 'file:///front.jpg', backUri: 'file:///back.jpg',
  });
  env.service.getProviderByUserId = async () => ({ ...profile('verification'), identityVerification: { verificationStatus: 'failed', cnicVerified: false } });
  await env.store.getState().loadProviderByUser('user-1');
  const Screen = env.load('app/(provider)/register/verification.tsx').default;
  env.runner.render(Screen); await flush();
  let tree = env.runner.render(Screen);
  assert.equal(find(tree, 'Input', 'CNIC Number').value, '35202-1234567-1');
  // Unverified: no "Continue", but a "Skip for now" (NADRA checks come later; the team checks by hand).
  assert.ok(!nodes(tree).some((node) => node.type === 'Button' && node.props.title === 'Continue to Review'));
  assert.equal(find(tree, 'Button', 'Skip for now').disabled, false);
  find(tree, 'Button', 'Verify CNIC').onPress(); await flush();
  tree = env.runner.render(Screen);
  assert.ok(find(tree, 'Button', 'Skip for now'));
  verification.verifyCnic = async () => ({ verified: true, status: 'verified' });
  env.service.getProviderByUserId = async () => ({ ...profile('review'), identityVerification: { verificationStatus: 'verified', cnicVerified: true } });
  find(tree, 'Button', 'Verify CNIC').onPress(); await flush();
  tree = env.runner.render(Screen);
  assert.ok(!find(tree, 'Button', 'Continue to Review').disabled);
  find(tree, 'Button', 'Continue to Review').onPress();
  assert.equal(env.routes.at(-1), '/(provider)/register/review');
  assert.equal((await identityStore.loadIdentityDraft('user-1')).frontUri, '');
});

test('guide setup asks each thing once, in four tabs, and checks each tab before saving', async () => {
  const env = runtime();
  await flush();
  env.rn.TextInput = 'TextInput';
  env.mocks['@expo/vector-icons'] = { Ionicons: 'Icon' };
  env.mocks['@/components/ui/DatePickerModal'] = { DatePickerModal: 'DatePickerModal' };
  const saves = [];
  env.mocks['@/services/guideService'] = {
    getMyProfile: async () => ({ guideDetails: null }),
    updateProfile: async (patch, opts) => {
      saves.push([patch, opts]);
      return { guideDetails: patch };
    },
    refreshProviderAfterGuide: async () => null,
  };
  env.mocks['@/services/uploadService'] = { pickImages: async () => [{}], uploadImages: async () => [{ url: 'https://example.com/me.jpg' }] };
  await env.store.getState().loadProviderByUser('user-1');
  env.store.setState({ provider: { ...profile('transport'), services: ['travelGuide'] } });
  const Screen = env.load('components/guide/GuideOnboardingScreen.tsx').default;
  env.runner.render(Screen);
  await flush();
  let tree = env.runner.render(Screen);

  // Nothing that another step already asks: no CNIC, WhatsApp, age or date of birth here.
  const labels = nodes(tree).map((node) => String(node.props?.label ?? ''));
  for (const label of labels) assert.doesNotMatch(label, /\b(CNIC|WhatsApp|Age|Date of birth)\b/i);
  // Name and phone come from the account and show as a summary card.
  assert.ok(nodes(tree).some((node) => node.props?.accessibilityLabel === 'Edit name, phone and email'));

  // An empty profile cannot be saved.
  await find(tree, 'Button', 'Save & continue').onPress();
  await flush();
  assert.equal(saves.length, 0);
  assert.match(env.alerts.at(-1).join(' '), /profile photo/);

  // Fill the profile tab.
  find(tree, 'ImagePickerField', 'Profile photo *').onAdd();
  for (let i = 0; i < 4; i++) await flush();
  // The chip groups are a small component; tap them through its onToggle.
  const tapChip = (label) => {
    const group = nodes(tree).find((n) => Array.isArray(n.props?.options) && n.props.options.some((o) => o.label === label));
    assert.ok(group, `Missing chip: ${label}`);
    group.props.onToggle(group.props.options.find((o) => o.label === label).value);
    tree = env.runner.render(Screen);
  };
  tree = env.runner.render(Screen);
  tapChip('Trekking');
  tapChip('Hunza');
  tapChip('English');
  nodes(tree).find((n) => n.props?.label === 'Short bio *').props.onChange('I have guided treks around Hunza and Nagar for eight years.');
  tree = env.runner.render(Screen);
  await find(tree, 'Button', 'Save & continue').onPress();
  for (let i = 0; i < 4; i++) await flush();
  assert.equal(saves.length, 1, JSON.stringify(env.alerts.at(-1)));
  const [saved, opts] = saves[0];
  assert.deepEqual(saved.guideTypes, ['trekking']);
  assert.deepEqual(saved.areasCovered, ['Hunza']);
  assert.deepEqual(saved.languages.map((l) => l.language), ['English']);
  assert.equal(saved.profilePhoto, 'https://example.com/me.jpg');
  assert.equal(opts.submit, false);

  // Tab 2: services — needs a service or a daily rate.
  tree = env.runner.render(Screen);
  assert.ok(find(tree, 'Input', 'Rate per day (Rs)'));
  await find(tree, 'Button', 'Save & continue').onPress();
  await flush();
  assert.equal(saves.length, 1);
  assert.match(env.alerts.at(-1).join(' '), /service or a daily rate/);
  find(tree, 'Input', 'Rate per day (Rs)').onChangeText('8000');
  tree = env.runner.render(Screen);
  await find(tree, 'Button', 'Save & continue').onPress();
  for (let i = 0; i < 4; i++) await flush();
  assert.equal(saves.length, 2);
  assert.equal(saves[1][0].dailyHireRate, 8000);
});

test('tour operator setup: company tab, then a real first tour with a day plan sent for review', async () => {
  const env = runtime();
  await flush();
  env.rn.TextInput = 'TextInput';
  env.mocks['@expo/vector-icons'] = { Ionicons: 'Icon' };
  const itineraries = [];
  env.mocks['@/services/tourItineraryService'] = {
    listMine: async () => [],
    createItinerary: async (body) => {
      itineraries.push(body);
      return { ...body, id: 'tour-1', status: 'pending' };
    },
    updateItinerary: async (id, body) => ({ ...body, id, status: 'pending' }),
  };
  env.mocks['@/services/uploadService'] = { pickImages: async () => [{}], uploadImages: async () => [{ url: 'https://example.com/deosai.jpg' }] };
  await env.store.getState().loadProviderByUser('user-1');
  env.store.setState({ provider: { ...profile('transport'), services: ['tour'], tour: undefined } });
  env.store.getState().setSelectedServices(['tour']);
  const Screen = env.load('app/(provider)/register/tours.tsx').default;
  env.runner.render(Screen);
  await flush();
  let tree = env.runner.render(Screen);
  const tap = (label) => {
    const group = nodes(tree).find((n) => Array.isArray(n.props?.options) && n.props.options.some((o) => o.label === label));
    assert.ok(group, `Missing chip: ${label}`);
    group.props.onToggle(group.props.options.find((o) => o.label === label).value);
    tree = env.runner.render(Screen);
  };
  const type = (label, value) => {
    nodes(tree).find((n) => n.props?.label === label).props[ 'onChangeText' in nodes(tree).find((n) => n.props?.label === label).props ? 'onChangeText' : 'onChange' ](value);
    tree = env.runner.render(Screen);
  };

  // No fake defaults any more: an empty company cannot continue.
  find(tree, 'Button', 'Save & continue').onPress();
  await flush();
  assert.match(env.alerts.at(-1).join(' '), /company description/);

  type('Company name *', 'Skardu Trails');
  type('About your company *', 'Family-run operator from Skardu running small-group treks.');
  tap('Skardu');
  tap('Treks');
  find(tree, 'Button', 'Save & continue').onPress();
  for (let i = 0; i < 4; i++) await flush();
  tree = env.runner.render(Screen);
  assert.equal(env.store.getState().draft.tour.companyName, 'Skardu Trails');
  assert.deepEqual(env.store.getState().draft.tour.operatingAreas, ['Skardu']);

  // Tab 2: the day plan follows the number of days.
  assert.equal(nodes(tree).filter((n) => n.props?.label === 'Title').length, 3);
  type('Tour name *', 'Deosai Trek — 3 Days');
  type('One-line summary *', 'Camp on the Deosai plains and spot brown bears.');
  type('Price per person (Rs) *', '45000');
  const titles = nodes(tree).filter((n) => n.props?.label === 'Title');
  titles.forEach((t, i) => t.props.onChangeText(`Day ${i + 1} plan`));
  tree = env.runner.render(Screen);
  find(tree, 'ImagePickerField', 'Cover photo *').onAdd();
  for (let i = 0; i < 4; i++) await flush();
  tree = env.runner.render(Screen);
  find(tree, 'Button', 'Save & continue to CNIC').onPress();
  for (let i = 0; i < 6; i++) await flush();
  assert.equal(itineraries.length, 1, JSON.stringify(env.alerts.at(-1)));
  const sent = itineraries[0];
  assert.equal(sent.title, 'Deosai Trek — 3 Days');
  assert.equal(sent.destination, 'Skardu');
  assert.equal(sent.days.length, 3);
  assert.equal(sent.durationNights, 2);
  assert.equal(sent.submitForReview, true);
  assert.ok(sent.description.length >= 20, 'description is built from the plan');
  assert.equal(sent.coverImage, 'https://example.com/deosai.jpg');
  assert.equal(env.routes.at(-1), '/(provider)/register/verification');
});

test('restaurant setup: no made-up content, nothing asked twice, then menu & offers', async () => {
  const env = runtime();
  await flush();
  env.rn.TextInput = 'TextInput';
  env.mocks['@expo/vector-icons'] = { Ionicons: 'Icon' };
  env.mocks['@/services/uploadService'] = { pickImages: async () => [{}], uploadImages: async () => [{ url: 'https://example.com/karahi.jpg' }] };
  await env.store.getState().loadProviderByUser('user-1');
  env.store.setState({ provider: { ...profile('transport'), services: ['restaurant'], restaurant: undefined } });
  env.store.getState().setSelectedServices(['restaurant']);
  env.store.getState().setLocationDraft({
    latitude: 36.31,
    longitude: 74.65,
    placeName: 'Karimabad',
    address: { city: 'Hunza', formattedAddress: 'Karimabad Bazaar, Hunza', country: 'Pakistan' },
  });
  const Screen = env.load('app/(provider)/register/restaurant.tsx').default;
  let tree = env.runner.render(Screen);
  const labels = nodes(tree).map((n) => String(n.props?.label ?? ''));
  // Phone, city, address and website come from the account and the map pin.
  for (const label of labels) assert.doesNotMatch(label, /\b(Phone|City|Address|Website)\b/i);
  // No made-up cuisines, dishes or offers are pre-filled any more.
  const chipGroups = nodes(tree).filter((n) => Array.isArray(n.props?.options));
  assert.deepEqual(chipGroups.find((g) => g.props.options.some((o) => o.label === 'Pakistani')).props.selected, []);

  const tap = (label) => {
    const group = nodes(tree).find((n) => Array.isArray(n.props?.options) && n.props.options.some((o) => o.label === label));
    assert.ok(group, `Missing chip: ${label}`);
    group.props.onToggle(group.props.options.find((o) => o.label === label).value);
    tree = env.runner.render(Screen);
  };
  find(tree, 'Button', 'Save & continue').onPress();
  for (let i = 0; i < 3; i++) await flush();
  assert.match(env.alerts.at(-1).join(' '), /photo/);

  find(tree, 'ImagePickerField', 'Restaurant photos *').onAdd();
  for (let i = 0; i < 4; i++) await flush();
  tree = env.runner.render(Screen);
  find(tree, 'Input', 'Restaurant name *').onChangeText('Rakaposhi View Café');
  tree = env.runner.render(Screen);
  tap('Hunza local');
  nodes(tree).find((n) => n.props?.label === 'Short description *').props.onChange('Family restaurant with a terrace view of Rakaposhi.');
  tree = env.runner.render(Screen);
  find(tree, 'Button', 'Save & continue').onPress();
  for (let i = 0; i < 4; i++) await flush();
  tree = env.runner.render(Screen);
  const saved = env.store.getState().draft.restaurant;
  assert.equal(saved.restaurantName, 'Rakaposhi View Café');
  assert.equal(saved.address, 'Karimabad Bazaar, Hunza');
  assert.equal(saved.city, 'Hunza');
  assert.equal(saved.hours, 'Every day · 09:00–23:00');
  assert.equal(saved.latitude, 36.31);

  // Tab 2: dish ideas come from the chosen cuisine.
  tap('Chapshoro');
  find(tree, 'Button', 'Save & continue to CNIC').onPress();
  for (let i = 0; i < 4; i++) await flush();
  assert.deepEqual(env.store.getState().draft.restaurant.menuVariety, ['Chapshoro']);
  assert.deepEqual(env.store.getState().draft.restaurant.offers, []);
  assert.equal(env.routes.at(-1), '/(provider)/register/verification');
});
