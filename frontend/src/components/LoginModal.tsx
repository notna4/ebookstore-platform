import { ContentSwitcher, InlineNotification, Modal, PasswordInput, Switch, TextInput } from '@carbon/react';
import { useState } from 'react';
import { isValidEmail } from '../lib/validation';
import { useStore } from '../store/StoreContext';
import { useUi } from '../store/UiContext';

type Mode = 'login' | 'register';

const nameFromEmail = (email: string): string => {
  const local = email.split('@')[0] ?? 'Reader';
  return local.charAt(0).toUpperCase() + local.slice(1);
};

/**
 * Client-side mock authentication. The password is validated but never stored.
 * To be replaced by OpenID Connect once the backend is in place.
 */
export function LoginModal() {
  const { loginOpen, closeLogin } = useUi();
  const { dispatch } = useStore();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setErrors({});
  };

  const close = () => {
    reset();
    closeLogin();
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (mode === 'register' && !name.trim()) e.name = 'Name is required';
    if (!isValidEmail(email)) e.email = 'Enter a valid e-mail';
    if (password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    dispatch({
      type: 'login',
      user: { email: email.trim().toLowerCase(), name: mode === 'register' ? name.trim() : nameFromEmail(email.trim()) },
    });
    close();
  };

  return (
    <Modal
      open={loginOpen}
      size="sm"
      modalHeading={mode === 'login' ? 'Sign in to Book Worm' : 'Create your account'}
      primaryButtonText={mode === 'login' ? 'Sign in' : 'Register'}
      secondaryButtonText="Cancel"
      onRequestClose={close}
      onRequestSubmit={submit}
    >
      <ContentSwitcher
        size="md"
        selectedIndex={mode === 'login' ? 0 : 1}
        onChange={({ name: n }) => {
          setMode(n as Mode);
          setErrors({});
        }}
      >
        <Switch name="login" text="Sign in" />
        <Switch name="register" text="Register" />
      </ContentSwitcher>
      <form
        className="stack"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <InlineNotification
          hideCloseButton
          lowContrast
          kind="info"
          title="Demo mode"
          subtitle="Any valid e-mail and an 8+ character password will work. No data leaves your browser."
        />
        {mode === 'register' && (
          <TextInput id="auth-name" labelText="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} invalidText={errors.name} />
        )}
        <TextInput id="auth-email" type="email" labelText="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} invalidText={errors.email} />
        <PasswordInput id="auth-password" labelText="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} invalidText={errors.password} />
      </form>
    </Modal>
  );
}
