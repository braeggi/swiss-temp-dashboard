import { useMemo } from 'react';
import type { PackedStation } from '../types';
import { WarmingStripesChart } from '../components/WarmingStripes';
import { annualMeans } from '../lib/series';
import { REFERENCE_FROM, REFERENCE_TO, warmingStripes } from '../lib/warmingStripes';

export interface StripesEvidenceProps {
  station: PackedStation | null;
  /** True for a geocoded place: Open-Meteo is fetched one day at a time. */
  isPlace: boolean;
  homogenised: boolean;
}

export default function StripesEvidence({ station, isPlace, homogenised }: StripesEvidenceProps) {
  const data = useMemo(
    () => (station === null ? null : warmingStripes(annualMeans(station))),
    [station],
  );

  return (
    <section className="evidence" id="evidence-stripes">
      <h2>How much has it warmed here?</h2>
      {isPlace || station === null ? (
        <p className="status">
          Not available for a searched place — this view needs a MeteoSwiss station's own
          annual record.
        </p>
      ) : data === null ? (
        <p className="status">
          Not available for this station — colouring every year against the{' '}
          {REFERENCE_FROM}–{REFERENCE_TO} average needs a record that reaches back into that
          period, and this one starts later.
        </p>
      ) : (
        <WarmingStripesChart data={data} homogenised={homogenised} />
      )}
    </section>
  );
}
