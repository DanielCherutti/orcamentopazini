/**
 * Regression: tenant license helpers (sem DB).
 */
import {
    getTenantAccessBlockReason,
    isTenantLicenseValid,
    tenantAccessLoginErrorParam,
} from "../src/lib/tenant-license";

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

assert(isTenantLicenseValid({ active: true, license_expires_at: future }), "future ok");
assert(!isTenantLicenseValid({ active: false, license_expires_at: future }), "inactive");
assert(!isTenantLicenseValid({ active: true, license_expires_at: past }), "expired");
assert(getTenantAccessBlockReason({ active: false, license_expires_at: null }) === "inactive", "inactive reason");
assert(getTenantAccessBlockReason({ active: true, license_expires_at: past }) === "expired", "expired reason");
assert(tenantAccessLoginErrorParam("inactive") === "org_inactive", "login param inactive");
assert(tenantAccessLoginErrorParam("expired") === "license_expired", "login param expired");

console.log("platform-license-enforcement-regression: OK");
