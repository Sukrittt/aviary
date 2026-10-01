import { pageMetadata } from '@/lib/seo'
import { getSystemSettings } from '@/lib/systemSettings'
import { ActionForm, SubmitButton } from '../ActionForm'
import { saveSettingsAction } from './actions'

export default async function AdminSystem() {
  const settings = await getSystemSettings()

  return (
    <>
      <div className="adm-head">
        <h1>System</h1>
        <span className="adm-sub">Global switches · every change is audited</span>
      </div>

      <section className="erd-card">
        <ActionForm action={saveSettingsAction} className="adm-form" key={JSON.stringify(settings)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="aiDisabled" defaultChecked={settings.aiDisabled} style={{ marginTop: 4 }} />
              <span>
                <strong>Disable AI features</strong>
                <div className="adm-sub">Ask Aviary chat, daily brief, bill scan and category suggestions answer 503. Coach pushes fall back to their plain text.</div>
              </span>
            </label>

            <input
              className="adm-input"
              name="aiMonthlyCostUsd"
              defaultValue={settings.aiMonthlyCostUsd ?? ''}
              placeholder="Monthly AI allowance per user in USD, e.g. 0.10 (empty = no cap)"
              inputMode="decimal"
              maxLength={12}
            />

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="maintenanceOn" defaultChecked={settings.maintenance.on} style={{ marginTop: 4 }} />
              <span>
                <strong>Show maintenance banner</strong>
                <div className="adm-sub">Shown at the top of every web page and returned by GET /api/system/status.</div>
              </span>
            </label>

            <input className="adm-input" name="maintenanceMessage" defaultValue={settings.maintenance.message} placeholder="e.g. Scheduled maintenance tonight 11pm–midnight IST" maxLength={280} />

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
              <strong>Android app update</strong>
              <div className="adm-sub">Set this after a new Play Store release. Leave the version empty to hide the update link in the app. Set a minimum only after a native build that OTA updates can&apos;t deliver.</div>
            </div>

            <input
              className="adm-input"
              name="androidLatestVersion"
              defaultValue={settings.appUpdate.android.latestVersion}
              placeholder="Latest version, e.g. 2.3.0"
              inputMode="decimal"
              maxLength={32}
            />

            <input
              className="adm-input"
              name="androidMinVersion"
              defaultValue={settings.appUpdate.android.minVersion}
              placeholder="Minimum version, e.g. 2.3.0 (older installs see a Home banner)"
              inputMode="decimal"
              maxLength={32}
            />

            <input
              className="adm-input"
              name="androidStoreUrl"
              defaultValue={settings.appUpdate.android.storeUrl}
              placeholder="Google Play Store URL"
              type="url"
              maxLength={500}
            />

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
              <strong>Subscriptions</strong>
              <div className="adm-sub">Run scripts/billing-launch-migration.mjs before turning enforcement on — without it, every existing user is locked out.</div>
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="billingPurchaseEnabled" defaultChecked={settings.billing.purchaseEnabled} style={{ marginTop: 4 }} />
              <span>
                <strong>Show purchase options</strong>
                <div className="adm-sub">Offers the Play Store checkout in the Android app. Nobody is locked out by this on its own.</div>
              </span>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="billingEnforced" defaultChecked={settings.billing.enforced} style={{ marginTop: 4 }} />
              <span>
                <strong>Enforce subscription access</strong>
                <div className="adm-sub">Expired trials and lapsed subscriptions get 402 from app APIs. Export, billing and account controls stay open.</div>
              </span>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="billingAudience" value="everyone" defaultChecked={settings.billing.audience === 'everyone'} style={{ marginTop: 4 }} />
              <span>
                <strong>Apply to everyone (production)</strong>
                <div className="adm-sub">Off = the two switches above only affect billing testers (npm run billing:tester -- --email …). Everyone else sees subscriptions as off. Leave this off until launch day.</div>
              </span>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" name="billingRetentionDelete" defaultChecked={settings.billing.retentionDeleteEnabled} style={{ marginTop: 4 }} />
              <span>
                <strong>Delete accounts after the retention window</strong>
                <div className="adm-sub">Irreversible. Twelve months after access ends, the account and all its data are purged. Off = the job still sets deadlines and sends the 30/7/1-day notices, and /admin/jobs reports how many it would delete.</div>
              </span>
            </label>

            <div>
              <SubmitButton variant="primary">Save</SubmitButton>
            </div>
          </div>
        </ActionForm>
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/system')
