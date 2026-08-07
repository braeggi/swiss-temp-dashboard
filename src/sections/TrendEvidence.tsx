import { useMemo } from 'react';
import type { PackedStation } from '../types';
import { ThresholdToggle } from '../components/ThresholdToggle';
import { ThresholdChart } from '../components/ThresholdChart';
import { thresholdDays, type ThresholdKey } from '../lib/thresholdDays';

export interface TrendEvidenceProps {
  station: PackedStation | null;
  isPlace: boolean;
  threshold: ThresholdKey;
  onThresholdChange: (t: ThresholdKey) => void;
  homogenised: boolean;
}

function TrendChart({
  station, threshold, homogenised,
}: { station: PackedStation; threshold: ThresholdKey; homogenised: boolean }) {
  const rows = useMemo(() => thresholdDays(station, threshold), [station, threshold]);
  return <ThresholdChart rows={rows} threshold={threshold} homogenised={homogenised} />;
}

export default function TrendEvidence({
  station, isPlace, threshold, onThresholdChange, homogenised,
}: TrendEvidenceProps) {
  if (isPlace || station === null) {
    return (
      <section className="evidence" id="evidence-trend">
        <h2>Is it getting hotter here?</h2>
        <p className="status">
          Not available for a searched place — this view needs a MeteoSwiss station's
          long-term record.
        </p>
      </section>
    );
  }

  return (
    <section className="evidence" id="evidence-trend">
      <h2>Is it getting hotter here?</h2>
      <div className="controls">
        <ThresholdToggle value={threshold} onChange={onThresholdChange} />
      </div>
      <TrendChart station={station} threshold={threshold} homogenised={homogenised} />
    </section>
  );
}
