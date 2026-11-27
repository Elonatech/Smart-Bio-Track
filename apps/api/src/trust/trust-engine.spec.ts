import { LocationPolicy, PunchType } from '@prisma/client';
import {
  decide,
  deviceSignal,
  geofenceSignal,
  integritySignal,
  networkSignal,
  overtimeOffsiteSignal,
  replaySignal,
  scoreOf,
  velocitySignal,
  webSignal,
  type Signal,
} from './trust-engine';

const settings = {
  maxAccuracyMeters: 50,
  fenceMarginMeters: 25,
  maxSpeedKmh: 300,
};
const office = (distanceMeters: number, radiusMeters = 100) => ({
  name: 'HQ',
  distanceMeters,
  radiusMeters,
});

describe('trust engine', () => {
  describe('geofenceSignal', () => {
    it('passes inside the fence with a good fix', () => {
      expect(
        geofenceSignal({ accuracyMeters: 10, nearest: office(40) }, settings)
          .result,
      ).toBe('PASS');
    });

    it('is weak inside the fence with a poor fix', () => {
      expect(
        geofenceSignal({ accuracyMeters: 120, nearest: office(40) }, settings)
          .result,
      ).toBe('WEAK');
    });

    it('treats a missing accuracy as a poor fix', () => {
      expect(
        geofenceSignal({ accuracyMeters: null, nearest: office(40) }, settings)
          .result,
      ).toBe('WEAK');
    });

    it('is weak just outside, within the margin', () => {
      expect(
        geofenceSignal({ accuracyMeters: 10, nearest: office(120) }, settings)
          .result,
      ).toBe('WEAK');
    });

    it('is weak outside when a poor fix could reach inside', () => {
      // 300 m out, ±250 m: the true position could be 50 m out — or inside.
      expect(
        geofenceSignal({ accuracyMeters: 250, nearest: office(300) }, settings)
          .result,
      ).toBe('WEAK');
    });

    it('fails clearly outside with a good fix', () => {
      const s = geofenceSignal(
        { accuracyMeters: 10, nearest: office(2000) },
        settings,
      );
      expect(s.result).toBe('FAIL');
      expect(s.reason).toContain('2000 m from HQ');
    });

    it('fails with no location or no office', () => {
      expect(
        geofenceSignal({ accuracyMeters: 10, nearest: null }, settings).result,
      ).toBe('FAIL');
    });

    it('treats the radius itself as inside', () => {
      expect(
        geofenceSignal({ accuracyMeters: 10, nearest: office(100) }, settings)
          .result,
      ).toBe('PASS');
    });
  });

  describe('networkSignal', () => {
    it('passes on an office range', () => {
      expect(
        networkSignal({
          ipAddress: '105.127.12.242',
          anyRangesConfigured: true,
          matchedOffice: 'HQ',
        }).result,
      ).toBe('PASS');
    });
    it('fails off every range', () => {
      expect(
        networkSignal({
          ipAddress: '102.88.104.247',
          anyRangesConfigured: true,
          matchedOffice: null,
        }).result,
      ).toBe('FAIL');
    });
    it('fails when no ranges are set up', () => {
      expect(
        networkSignal({
          ipAddress: '105.127.12.242',
          anyRangesConfigured: false,
          matchedOffice: null,
        }).reason,
      ).toMatch(/No office network/);
    });
    it('fails when the address is unknown', () => {
      expect(
        networkSignal({
          ipAddress: null,
          anyRangesConfigured: true,
          matchedOffice: null,
        }).result,
      ).toBe('FAIL');
    });
  });

  describe('velocitySignal', () => {
    it('passes with nothing to compare', () => {
      expect(velocitySignal(null, settings).result).toBe('PASS');
    });
    it('passes a plausible journey (20 km in an hour)', () => {
      expect(
        velocitySignal({ distanceMeters: 20_000, secondsAgo: 3600 }, settings)
          .result,
      ).toBe('PASS');
    });
    it('is weak for impossible travel (500 km in 30 minutes)', () => {
      expect(
        velocitySignal({ distanceMeters: 500_000, secondsAgo: 1800 }, settings)
          .result,
      ).toBe('WEAK');
    });
    it("doesn't call GPS jitter between quick taps impossible", () => {
      // 30 m in 5 seconds is 21.6 km/h — fine — but the floor of one minute
      // keeps much larger jitter from reading as a flight.
      expect(
        velocitySignal({ distanceMeters: 2_000, secondsAgo: 5 }, settings)
          .result,
      ).toBe('PASS');
    });
  });

  it('the identity signals pass and fail on their facts', () => {
    expect(
      deviceSignal({ hasActiveDevice: true, signatureValid: true }).result,
    ).toBe('PASS');
    expect(
      deviceSignal({ hasActiveDevice: true, signatureValid: false }).result,
    ).toBe('FAIL');
    expect(
      deviceSignal({ hasActiveDevice: false, signatureValid: false }).result,
    ).toBe('FAIL');
    expect(replaySignal(true).result).toBe('PASS');
    expect(replaySignal(false).result).toBe('FAIL');
    expect(integritySignal().result).toBe('NOT_CHECKED');
  });

  describe('decide', () => {
    const ok = (signal: Signal['signal']): Signal => ({
      signal,
      result: 'PASS',
      reason: '',
    });
    const weakS = (signal: Signal['signal']): Signal => ({
      signal,
      result: 'WEAK',
      reason: '',
    });
    const failS = (signal: Signal['signal']): Signal => ({
      signal,
      result: 'FAIL',
      reason: '',
    });
    const identity = [ok('device'), ok('replay'), integritySignal()];

    const clockIn = (
      signals: Signal[],
      policy: LocationPolicy = LocationPolicy.EITHER,
    ) =>
      decide({ type: PunchType.CLOCK_IN, source: 'MOBILE', policy, signals })
        .outcome;

    it('approves a verified phone inside the fence', () => {
      expect(
        clockIn([
          ...identity,
          ok('geofence'),
          failS('network'),
          ok('velocity'),
        ]),
      ).toBe('APPROVED');
    });

    it('approves on the office network alone under EITHER', () => {
      expect(
        clockIn([
          ...identity,
          failS('geofence'),
          ok('network'),
          ok('velocity'),
        ]),
      ).toBe('APPROVED');
    });

    it('rejects when the signature fails, wherever the person is', () => {
      expect(
        clockIn([failS('device'), ok('replay'), ok('geofence'), ok('network')]),
      ).toBe('REJECTED');
    });

    it('rejects a replayed code', () => {
      expect(clockIn([ok('device'), failS('replay'), ok('geofence')])).toBe(
        'REJECTED',
      );
    });

    it('does not flag for integrity while it is NOT_CHECKED', () => {
      expect(clockIn([...identity, ok('geofence'), ok('velocity')])).toBe(
        'APPROVED',
      );
    });

    it('flags a weak fence that the network cannot settle (D2)', () => {
      expect(clockIn([...identity, weakS('geofence'), failS('network')])).toBe(
        'FLAGGED',
      );
    });

    it('rejects clearly outside and off the network', () => {
      expect(clockIn([...identity, failS('geofence'), failS('network')])).toBe(
        'REJECTED',
      );
    });

    it('flags impossible travel even when inside the fence', () => {
      expect(clockIn([...identity, ok('geofence'), weakS('velocity')])).toBe(
        'FLAGGED',
      );
    });

    describe('under BOTH', () => {
      it('needs the fence and the network', () => {
        expect(
          clockIn(
            [...identity, ok('geofence'), ok('network')],
            LocationPolicy.BOTH,
          ),
        ).toBe('APPROVED');
        expect(
          clockIn(
            [...identity, ok('geofence'), failS('network')],
            LocationPolicy.BOTH,
          ),
        ).toBe('REJECTED');
        expect(
          clockIn(
            [...identity, failS('geofence'), ok('network')],
            LocationPolicy.BOTH,
          ),
        ).toBe('REJECTED');
      });
      it('flags a weak fence with a passing network', () => {
        expect(
          clockIn(
            [...identity, weakS('geofence'), ok('network')],
            LocationPolicy.BOTH,
          ),
        ).toBe('FLAGGED');
      });
      it('rejects a weak fence off the network', () => {
        expect(
          clockIn(
            [...identity, weakS('geofence'), failS('network')],
            LocationPolicy.BOTH,
          ),
        ).toBe('REJECTED');
      });
    });

    it("doesn't judge location on breaks or clock-out (D13)", () => {
      const v = decide({
        type: PunchType.CLOCK_OUT,
        source: 'MOBILE',
        policy: LocationPolicy.EITHER,
        signals: [
          ...identity,
          failS('geofence'),
          failS('network'),
          weakS('velocity'),
        ],
      });
      expect(v.outcome).toBe('APPROVED');
    });

    it('flags a clock-out that earns overtime away from the office (D13)', () => {
      const v = decide({
        type: PunchType.CLOCK_OUT,
        source: 'MOBILE',
        policy: LocationPolicy.EITHER,
        signals: [...identity, failS('geofence'), overtimeOffsiteSignal(90)],
      });
      expect(v.outcome).toBe('FLAGGED');
    });

    it("still rejects a clock-out whose signature fails (D3: a colleague can't clock you out)", () => {
      const v = decide({
        type: PunchType.CLOCK_OUT,
        source: 'MOBILE',
        policy: LocationPolicy.EITHER,
        signals: [failS('device'), ok('replay')],
      });
      expect(v.outcome).toBe('REJECTED');
    });

    it('always flags a web punch and never rejects it on location (D14)', () => {
      for (const type of [PunchType.CLOCK_IN, PunchType.CLOCK_OUT]) {
        const v = decide({
          type,
          source: 'WEB',
          policy: LocationPolicy.BOTH,
          signals: [webSignal(), failS('geofence'), failS('network')],
        });
        expect(v.outcome).toBe('FLAGGED');
      }
    });
  });

  it('scores 100 clean, minus 15 per weak and 40 per fail, floored at 0', () => {
    const s = (result: Signal['result']): Signal => ({
      signal: 'geofence',
      result,
      reason: '',
    });
    expect(scoreOf([s('PASS'), s('NOT_CHECKED')])).toBe(100);
    expect(scoreOf([s('WEAK')])).toBe(85);
    expect(scoreOf([s('FAIL'), s('WEAK')])).toBe(45);
    expect(scoreOf([s('FAIL'), s('FAIL'), s('FAIL')])).toBe(0);
  });
});
