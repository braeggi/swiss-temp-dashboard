import { useMemo, useState } from 'react';
import type { Metric, PackedStation } from '../types';
import { MetricToggle } from '../components/MetricToggle';
import { YearOverviewChart } from '../components/YearOverviewChart';
import { yearOverview } from '../lib/yearOverview';

export interface YearEvidenceProps {
  station: PackedStation | null;
  /** True for a geocoded place: it has no station-length year to summarise. */
  isPlace: boolean;
  year: number;
  homogenised: boolean;
}

function YearChart({
  station, metric, year, homogenised,
}: { station: PackedStation; metric: Metric; year: number; homogenised: boolean }) {
  const days = useMemo(() => yearOverview(station, metric, year), [station, metric, year]);
  return <YearOverviewChart days={days} metric={metric} year={year} homogenised={homogenised} />;
}

export default function YearEvidence({ station, isPlace, year, homogenised }: YearEvidenceProps) {
  const [metric, setMetric] = useState<Metric>('mean');

  if (isPlace || station === null) {
    return (
      <section className="evidence" id="evidence-year">
        <h2>How is this year running?</h2>
        <p className="status">
          Not available for a searched place — Open-Meteo is fetched one calendar day at a
          time, so there is no year-long record to summarise here.
        </p>
      </section>
    );
  }

  return (
    <section className="evidence" id="evidence-year">
      <h2>How is this year running?</h2>
      <div className="controls">
        <MetricToggle value={metric} onChange={setMetric} />
      </div>
      <YearChart station={station} metric={metric} year={year} homogenised={homogenised} />
    </section>
  );
}
