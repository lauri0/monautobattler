import { useState } from 'react';
import { formatAbilityName } from '../utils/formatName';
import { isAbilityImplemented, getAbilityDescription } from '../battle/abilities';
import type { AbilityId } from '../models/types';

interface Props {
  ability: AbilityId;
  style?: React.CSSProperties;
}

export default function AbilityLabel({ ability, style }: Props) {
  const [visible, setVisible] = useState(false);
  const implemented = isAbilityImplemented(ability);
  const description = getAbilityDescription(ability);

  return (
    <span
      style={{ position: 'relative', display: 'inline-block', cursor: description ? 'help' : 'default', ...style }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {formatAbilityName(ability)}
      {!implemented && <span style={{ opacity: 0.6 }}> (Unimplemented)</span>}
      {visible && description && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0f3460',
          border: '1px solid #2a2a4a',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: '0.78em',
          color: '#eaeaea',
          pointerEvents: 'none',
          zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          maxWidth: 260,
          whiteSpace: 'normal',
          textAlign: 'center',
        }}>
          {description}
        </span>
      )}
    </span>
  );
}
