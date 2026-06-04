import { CUP_STATIC_IMAGE, CUP_SPIN_ENABLED, CUP_USE_3D, DEFAULT_LOGO } from '../lib/constants.js';
import LoyaltyCupModel from './LoyaltyCupModel.jsx';

// Sadakat halkası ortası — statik bardak veya 3D model
export default function LoyaltyCup3d() {
  if (CUP_USE_3D) {
    return <LoyaltyCupModel />;
  }

  const spinClass = CUP_SPIN_ENABLED ? ' isSpinning' : '';

  return (
    <div className={`loyaltyCupStatic${spinClass}`} aria-hidden="true">
      <img src={CUP_STATIC_IMAGE} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_LOGO; }} />
    </div>
  );
}
