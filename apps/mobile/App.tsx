// Phase 4 M2 trial: can this phone hold a key that only a fingerprint (or
// the device PIN) unlocks, and sign a one-time code from our server with it?
// A "fingerprint OK" yes/no would prove nothing — a tampered app can just say
// yes. A signature the server verifies is the proof. See spike/server.mjs.
//
// Throwaway screen: M5 replaces it with the real app.

import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';

// Device PIN allowed too (plan D3: phones without biometrics still prove
// it's their phone).
const biometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true });

type Signed = { id: string; signature: string };

export default function App() {
  const [server, setServer] = useState('http://192.168.0.0:8787');
  const [log, setLog] = useState<string[]>([]);
  const [lastSigned, setLastSigned] = useState<Signed | null>(null);

  const note = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l]);

  async function call(path: string, body?: object) {
    const res = await fetch(`${server}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  }

  // Each step catches its own failure so one broken step doesn't hide the
  // results of the others — every outcome is a finding.
  const step = (name: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      note(`${name} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const checkSensor = step('Sensor', async () => {
    const { available, biometryType, error } = await biometrics.isSensorAvailable();
    note(`Sensor: available=${available} type=${biometryType ?? '-'}${error ? ` error=${error}` : ''}`);
  });

  const createAndRegister = step('Register', async () => {
    const { publicKey } = await biometrics.createKeys();
    const { status, json } = await call('/register', { publicKey });
    note(`Register: ${status} ${JSON.stringify(json)}`);
  });

  async function signFresh(): Promise<Signed | null> {
    const { json } = await call('/challenge');
    const { success, signature, error } = await biometrics.createSignature({
      promptMessage: 'Confirm it is you',
      payload: json.challenge,
    });
    if (!success || !signature) {
      note(`Sign: no signature (${error ?? 'cancelled'})`);
      return null;
    }
    return { id: json.id, signature };
  }

  const signAndVerify = step('Sign', async () => {
    const signed = await signFresh();
    if (!signed) return;
    setLastSigned(signed);
    const { status, json } = await call('/verify', signed);
    note(`Verify: ${status} ${JSON.stringify(json)}   (expect 200)`);
  });

  const replay = step('Replay', async () => {
    if (!lastSigned) return note('Replay: sign once first');
    const { status, json } = await call('/verify', lastSigned);
    note(`Replay: ${status} ${JSON.stringify(json)}   (expect 409)`);
  });

  // New key on the phone but NOT registered with the server: stands in for
  // another person's phone signing the challenge.
  const otherKey = step('Other key', async () => {
    await biometrics.createKeys();
    const signed = await signFresh();
    if (!signed) return;
    const { status, json } = await call('/verify', signed);
    note(`Other key: ${status} ${JSON.stringify(json)}   (expect 401). Tap Register to restore.`);
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Device key trial</Text>
      <TextInput
        style={styles.input}
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {[
        ['1. Check sensor', checkSensor],
        ['2. Create key and register', createAndRegister],
        ['3. Sign a challenge', signAndVerify],
        ['4. Replay last signature', replay],
        ['5. Sign with an unregistered key', otherKey],
      ].map(([label, onPress]) => (
        <Pressable key={label as string} style={styles.button} onPress={onPress as () => void}>
          <Text style={styles.buttonText}>{label as string}</Text>
        </Pressable>
      ))}
      <ScrollView style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>{line}</Text>
        ))}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 },
  button: { backgroundColor: '#0f766e', borderRadius: 6, padding: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
  log: { flex: 1, marginTop: 8 },
  logLine: { fontFamily: 'monospace', fontSize: 12, marginBottom: 6 },
});
