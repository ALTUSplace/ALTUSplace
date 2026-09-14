import { describe, expect, it } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

type UserRole = 'renter' | 'owner' | 'admin' | 'user' | 'SUPER_ADMIN';

function context(role: UserRole): TrpcContext {
  return {
    user: {
      id: role === 'SUPER_ADMIN' ? 99 : 2,
      openId: `${role}-user`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: 'test',
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

describe('Super Admin authorization boundary', () => {
  it('rejects a renter from the super overview KPIs', async () => {
    const caller = appRouter.createCaller(context('renter'));
    await expect(caller.admin.super.overviewKpis()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an owner from the super moderation queue', async () => {
    const caller = appRouter.createCaller(context('owner'));
    await expect(caller.admin.super.moderationQueue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an admin (non-super) from the health endpoint', async () => {
    const caller = appRouter.createCaller(context('admin'));
    await expect(caller.admin.super.health()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a renter from the user role mutation', async () => {
    const caller = appRouter.createCaller(context('renter'));
    await expect(caller.admin.super.setUserRole({ userId: 5, role: 'owner' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a SUPER_ADMIN to read overview KPIs even when the database is unavailable', async () => {
    const caller = appRouter.createCaller(context('SUPER_ADMIN'));
    const result = await caller.admin.super.overviewKpis();
    expect(result.totalUsers).toBeGreaterThanOrEqual(0);
    expect(result.pendingQueue).toBeGreaterThanOrEqual(0);
  });

  it('allows a SUPER_ADMIN to poll the health endpoint even when the database is unavailable', async () => {
    const caller = appRouter.createCaller(context('SUPER_ADMIN'));
    const result = await caller.admin.super.health();
    expect(result.db.ok).toBe(false);
    expect(typeof result.whatsapp.status).toBe('string');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('keeps the super boundary isolated from the admin panel in one flow', async () => {
    const renterCaller = appRouter.createCaller(context('renter'));
    const adminCaller = appRouter.createCaller(context('admin'));
    await expect(renterCaller.admin.super.overviewKpis()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminCaller.admin.super.users({ q: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(renterCaller.admin.super.setUserStatus({ userId: 5, status: 'banned' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});