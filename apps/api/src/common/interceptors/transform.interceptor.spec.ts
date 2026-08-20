import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let reflector: Reflector;
  let interceptor: TransformInterceptor<unknown>;

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  const handlerReturning = (payload: unknown): CallHandler =>
    ({ handle: () => of(payload) }) as CallHandler;

  const run = (payload: unknown) =>
    lastValueFrom(interceptor.intercept(context, handlerReturning(payload)));

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    interceptor = new TransformInterceptor(reflector);
  });

  it('wraps a plain object in the success envelope', async () => {
    const result = await run({ id: 'user-1' });

    expect(result).toEqual({
      success: true,
      message: 'Request successful.',
      data: { id: 'user-1' },
    });
  });

  it('wraps an array without treating it as a message carrier', async () => {
    const result = await run([{ id: 'a' }, { id: 'b' }]);

    expect(result.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.success).toBe(true);
  });

  it('uses the @ResponseMessage value when present', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('Signed in successfully.');

    const result = await run({ accessToken: 'a' });

    expect(result.message).toBe('Signed in successfully.');
    expect(result.data).toEqual({ accessToken: 'a' });
  });

  it("lifts a handler's own message out of data", async () => {
    const result = await run({ message: 'Signed out' });

    expect(result).toEqual({
      success: true,
      message: 'Signed out',
      data: null,
    });
  });

  it('lifts the message but keeps the remaining fields as data', async () => {
    const result = await run({ message: 'Reset link sent', resetToken: 'abc' });

    expect(result).toEqual({
      success: true,
      message: 'Reset link sent',
      data: { resetToken: 'abc' },
    });
  });

  it('prefers the decorator over a message on the payload', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('Decorated.');

    const result = await run({ message: 'From payload', id: 1 });

    expect(result.message).toBe('Decorated.');
    expect(result.data).toEqual({ id: 1 });
  });

  it('represents an empty body as null data', async () => {
    expect((await run(undefined)).data).toBeNull();
    expect((await run(null)).data).toBeNull();
  });

  it('passes primitives through as data', async () => {
    expect((await run('hello')).data).toBe('hello');
    expect((await run(42)).data).toBe(42);
  });
});
