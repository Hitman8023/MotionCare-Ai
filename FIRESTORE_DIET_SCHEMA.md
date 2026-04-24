# Diet Tracking Firestore Schema

## Collections

### `dietPlans/{patientId}`
One plan document per patient.

```json
{
  "patientId": "patientUid",
  "assignedBy": "doctorUid",
  "createdAt": "2026-04-24T10:00:00.000Z",
  "updatedAt": "2026-04-24T10:00:00.000Z",
  "meals": {
    "breakfast": ["Oats", "Fruit"],
    "lunch": ["Dal", "Rice", "Vegetables"],
    "dinner": ["Soup", "Protein"],
    "snacks": ["Nuts", "Yogurt"]
  }
}
```

### `dietLogs/{patientId}/entries/{date}`
Daily patient logs nested under patient.

```json
{
  "patientId": "patientUid",
  "date": "2026-04-24",
  "updatedAt": "2026-04-24T15:32:00.000Z",
  "meals": {
    "breakfast": { "completed": true, "extras": "" },
    "lunch": { "completed": false, "extras": "burger" },
    "dinner": { "completed": true, "extras": "" },
    "snacks": { "completed": true, "extras": "chips" }
  }
}
```

### `dietMetrics/{patientId}`
Computed metrics doc per patient (shared by doctor and patient views).

```json
{
  "patientId": "patientUid",
  "adherenceScore": 72,
  "junkCount": 3,
  "weeklyConsistency": 68,
  "updatedAt": "2026-04-24T15:33:00.000Z"
}
```

## Notes

- `patientId` uses Firebase auth UID.
- Date key format: `YYYY-MM-DD`.
- Metrics are computed by backend endpoint `POST /api/diet/metrics` and stored to Firestore.
- Frontend does not calculate adherence score anymore.
