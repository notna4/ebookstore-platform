import { InlineLoading, InlineNotification } from '@carbon/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';

/** Landing page of the OpenID Connect redirect: exchanges the code for tokens, then returns to where the user was. */
export function AuthCallback() {
  const { completeSignIn } = useStore();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!completeSignIn) {
      navigate('/', { replace: true });
      return;
    }
    completeSignIn().then(
      (returnTo) => navigate(returnTo, { replace: true }),
      () => setFailed(true),
    );
  }, [completeSignIn, navigate]);

  return (
    <div className="page">
      {failed ? (
        <InlineNotification hideCloseButton lowContrast kind="error" title="Sign-in failed" subtitle="Please go back to the store and try again." />
      ) : (
        <InlineLoading description="Signing you in…" />
      )}
    </div>
  );
}
