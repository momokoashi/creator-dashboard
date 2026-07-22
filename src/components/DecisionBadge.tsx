// Big, bold, unmissable decision — the thing the team reads first.
const STYLES = {
  ACCEPT:  { label: 'ACCEPT',  cls: 'accept' },
  COUNTER: { label: 'COUNTER', cls: 'counter' },
  PASS:    { label: 'PASS',    cls: 'pass' },
  UNKNOWN: { label: 'NEED DATA', cls: 'unknown' },
};

export default function DecisionBadge({ decision, reason, overridden }) {
  const s = STYLES[decision] || STYLES.UNKNOWN;
  return (
    <div className={'decision decision-' + s.cls}>
      <div className="decision-word">
        {s.label}
        {overridden && <span className="decision-tag">manual override</span>}
      </div>
      {reason && <p className="decision-reason">{reason}</p>}
    </div>
  );
}
