import type { FieldState } from '../models/types';

// Placeholder for a future terrain indicator. Intentionally empty so the
// arena center column reserves matching vertical space above/below the VS
// label. Extend by mirroring WeatherDisplay once terrains are implemented.
export default function TerrainDisplay(_props: { field: FieldState }) {
  return <div className="terrain-placeholder" aria-hidden />;
}
