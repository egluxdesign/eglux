// src/components/ui/EnvErrorPage.jsx
// ============================================================================
// EnvErrorPage — Full-screen error page yang render saat env vars missing
// ============================================================================
//
// Kapan render?
//   Saat app start (main.jsx), validateEnv() dipanggil. Kalau ada required
//   env var yang missing, halaman ini render sebagai pengganti App.
//
// Tujuan:
//   - Beri pesan error yang JELAS ke developer/user (bukan error runtime
//     yang mysterious seperti "Midtrans client key not configured")
//   - List semua env vars yang missing + cara dapetin nilainya
//   - Instruksi step-by-step untuk fix
// ============================================================================

import { getEnvDefinitions, env } from '../../lib/env';

const EnvErrorPage = ({ missing }) => {
  const allDefs = getEnvDefinitions();

  // Group missing vars by group
  const grouped = missing.reduce((acc, m) => {
    if (!acc[m.group]) acc[m.group] = [];
    acc[m.group].push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#faf6ef] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-red-700">Konfigurasi Environment Belum Lengkap</h1>
              <p className="text-sm text-red-600 mt-0.5">
                {missing.length} env var wajib belum di-set. App gak bisa jalan sampai diperbaiki.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Step-by-step fix */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
              Cara Fix (3 langkah)
            </p>
            <ol className="space-y-1.5 text-sm text-amber-900">
              <li>
                <strong>1.</strong> Copy file template env:
                <code className="block mt-1 bg-amber-100 px-2 py-1 rounded font-mono text-xs">
                  cp .env.example .env
                </code>
              </li>
              <li>
                <strong>2.</strong> Buka file <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">.env</code> di text editor,
                isi nilai untuk setiap var yang missing (lihat daftar di bawah).
              </li>
              <li>
                <strong>3.</strong> Restart Vite dev server:
                <code className="block mt-1 bg-amber-100 px-2 py-1 rounded font-mono text-xs">
                  npm run dev
                </code>
              </li>
            </ol>
          </div>

          {/* Missing env vars (grouped) */}
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">
              Env Vars yang Missing ({missing.length})
            </p>
            <div className="space-y-4">
              {Object.entries(grouped).map(([group, vars]) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-eglux-secondary mb-2">{group}</p>
                  <div className="space-y-2">
                    {vars.map((v) => (
                      <div key={v.key} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <code className="text-sm font-mono font-bold text-eglux-primary">{v.key}</code>
                          <span className="text-[0.65rem] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">REQUIRED</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-1.5">{v.description}</p>
                        <p className="text-[0.7rem] text-gray-400">
                          <span className="font-semibold">Cara dapetin:</span> {v.hint}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All env vars reference (collapsed) */}
          <details className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <summary className="text-xs font-semibold text-gray-600 cursor-pointer">
              Lihat semua env vars (termasuk yang optional)
            </summary>
            <div className="mt-3 space-y-1.5">
              {allDefs.map((def) => {
                const value = import.meta.env[def.key];
                const isMissing = !value || (typeof value === 'string' && value.trim() === '');
                return (
                  <div key={def.key} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${isMissing ? 'bg-red-400' : 'bg-green-400'}`} />
                    <code className="font-mono text-gray-700">{def.key}</code>
                    {def.required && (
                      <span className="text-[0.6rem] font-semibold text-gray-400">REQUIRED</span>
                    )}
                    {!isMissing && (
                      <span className="text-[0.6rem] text-green-600 ml-auto">✓ Set</span>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
          <p className="text-[0.7rem] text-gray-500 text-center">
            Setelah fix, refresh halaman ini. Kalau masih error, cek console browser untuk detail.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnvErrorPage;
