import { useEffect, useState } from "react";
import { defaults, type TrackingSettings, type Visit } from "../domain/types";
import { todaySummary } from "../domain/time-calculator";
const duration = (ms: number) =>
  `${Math.floor(ms / 60_000)} min ${Math.floor(ms / 1000) % 60} s`;
export function App() {
  const [settings, setSettings] = useState<TrackingSettings>(defaults);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [domains, setDomains] = useState("");
  async function request(message: object, refreshDomains = false) {
    setBusy(true);
    setError("");
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok)
        throw new Error(response?.error ?? "Falha no armazenamento local.");
      setSettings(response.data.settings);
      setVisits(response.data.visits);
      if (refreshDomains)
        setDomains(response.data.settings.excludedDomains.join("\n"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha no armazenamento local.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void request({ type: "snapshot" }, true);
    const timer = setInterval(() => {
      void request({ type: "snapshot" });
    }, 10_000);
    return () => clearInterval(timer);
  }, []);
  const summary = todaySummary(visits);
  return (
    <main>
      <header>
        <div className="mark">B</div>
        <div>
          <h1>BrowseMind</h1>
          <p>Sua navegação, no seu dispositivo.</p>
        </div>
      </header>
      <section>
        <span className={settings.enabled ? "status active" : "status"}>
          {settings.enabled ? "Monitoramento ativo" : "Monitoramento pausado"}
        </span>
        <p>
          Ao iniciar, você autoriza o registro local de domínios e períodos de
          navegação ativa. Caminhos, parâmetros e títulos das páginas não são
          armazenados.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void request({ type: "toggle", enabled: !settings.enabled })
          }
        >
          {settings.enabled ? "Pausar monitoramento" : "Autorizar e iniciar"}
        </button>
        <small>
          Ativo significa autorizado. O tempo só conta com uma página elegível
          em foco e usuário ativo.
        </small>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h2>Hoje</h2>
      <div className="stats">
        <div>
          <strong>{duration(summary.activeMs)}</strong>
          <span>tempo registrado</span>
        </div>
        <div>
          <strong>{summary.visitCount}</strong>
          <span>visitas</span>
        </div>
        <div>
          <strong>{summary.domains}</strong>
          <span>domínios</span>
        </div>
      </div>
      <h2>Últimas visitas</h2>
      {visits.length === 0 ? (
        <p>Nenhuma visita registrada. Inicie o monitoramento para começar.</p>
      ) : (
        <ol>
          {visits.slice(0, 10).map((v) => (
            <li key={v.id}>
              <strong>{v.domain}</strong>
              <span>{v.title}</span>
              <div>
                <time dateTime={v.startedAt}>
                  {new Date(v.startedAt).toLocaleString()}
                </time>
                <b>{duration(v.activeDurationMs)}</b>
              </div>
            </li>
          ))}
        </ol>
      )}
      <details>
        <summary>Domínios excluídos</summary>
        <label htmlFor="domains">
          Um domínio por linha (inclui subdomínios)
        </label>
        <textarea
          id="domains"
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() =>
            void request({
              type: "exclude",
              domains: domains
                .split(/\s+/)
                .map((d) => d.trim().toLowerCase())
                .filter(Boolean),
            })
          }
        >
          Salvar exclusões
        </button>
      </details>
      <footer>
        <p>
          Somente dados locais. Sem telemetria. Intervalos desconhecidos são
          descartados; os totais podem ser subestimados.
        </p>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Excluir permanentemente todas as visitas e sessões? O monitoramento será pausado.",
              )
            )
              void request({ type: "clear" });
          }}
        >
          Excluir histórico
        </button>
      </footer>
    </main>
  );
}
