import type { TypeName } from '../models/types';
import { getTypeColor } from '../utils/typeColors';

interface Props {
  type: TypeName;
}

export default function TypeBadge({ type }: Props) {
  return (
    <span className="type-badge" style={{ backgroundColor: getTypeColor(type) }}>
      {type}
    </span>
  );
}
