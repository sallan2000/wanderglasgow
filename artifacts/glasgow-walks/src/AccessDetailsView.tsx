import { ACCESS_FIELDS, unknownAccess, type AccessDetails } from './access-details';

const label = { unknown: 'Unknown', yes: 'Yes', no: 'No' } as const;

export default function AccessDetailsView({ access, testId }: { access?: AccessDetails; testId?: string }) {
  const a = access ?? unknownAccess();
  return (
    <div className="planner-note" data-testid={testId} style={{ marginTop: 8 }}>
      <strong>Access details (recorded, not certified)</strong>
      <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
        {ACCESS_FIELDS.map(({ key, label: l }) => <li key={key}>{l}: {label[a[key]] ?? 'Unknown'}</li>)}
      </ul>
      {a.notes && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>Owner-provided note: {a.notes}</p>}
    </div>
  );
}
