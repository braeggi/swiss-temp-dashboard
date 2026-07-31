import type { SourcePlan } from '../types';

export interface SourceNoteProps {
  plan: SourcePlan;
  usesOpenMeteo: boolean;
}

export function SourceNote({ plan, usesOpenMeteo }: SourceNoteProps) {
  return (
    <footer className="source-note">
      <ul>
        {plan.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="attribution">
        Source: MeteoSwiss
        {usesOpenMeteo && <> · Weather data by Open-Meteo.com</>}
      </p>
    </footer>
  );
}
