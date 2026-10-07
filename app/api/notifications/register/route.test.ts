import { it, expect, vi } from 'vitest'
vi.mock('@/lib/access', () => ({getAuth: async () => ({userId:'user_b',readOnly:false}),readOnlyGuard: () => null}))
const deleteOne = vi.fn(async () => ({deletedCount:0}))
vi.mock('@/lib/mongodb', () => ({getDb: async () => ({collection: () => ({deleteOne})})}))
const registerPushToken = vi.fn(async () => {})
vi.mock('@/lib/push', () => ({registerPushToken}))
const route = await import('./route')
const request = () => new Request('https://example.com/api/notifications/register', {method:'POST',body:JSON.stringify({token:'ExponentPushToken[device]',platform:'ios'})})
it('registers the token for the signed-in account, even if another account had it', async () => {
 expect((await route.POST(request())).status).toBe(200)
 expect(registerPushToken).toHaveBeenCalledWith('ExponentPushToken[device]','ios','user_b')
})
it('unregisters only the authenticated account registration', async () => {
 await route.DELETE(request())
 expect(deleteOne).toHaveBeenCalledWith({token:'ExponentPushToken[device]',user_id:'user_b'})
})
