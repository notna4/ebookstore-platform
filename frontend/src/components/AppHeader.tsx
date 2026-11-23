import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  SkipToContent,
} from '@carbon/react';
import { Asleep, Light, Login, Logout, ShoppingCart } from '@carbon/icons-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cartCount } from '../lib/pricing';
import { useStore } from '../store/StoreContext';
import { useAppTheme } from '../store/ThemeContext';
import { useUi } from '../store/UiContext';

const navItems = [
  { to: '/orders', label: 'My Orders' },
  { to: '/wishlist', label: 'My Wishlist' },
  { to: '/writers', label: 'My Writers' },
];

export function AppHeader() {
  const { state, dispatch } = useStore();
  const { openLogin } = useUi();
  const { theme, toggleTheme } = useAppTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const count = cartCount(state.cart);

  return (
    <Header aria-label="Book Worm">
      <SkipToContent />
      <HeaderName as={Link} to="/" prefix="">
        Book Worm
      </HeaderName>
      <HeaderNavigation aria-label="Account navigation">
        {navItems.map((n) => (
          <HeaderMenuItem
            key={n.to}
            as={NavLink}
            to={n.to}
            isCurrentPage={pathname === n.to}
          >
            {n.label}
          </HeaderMenuItem>
        ))}
      </HeaderNavigation>
      <HeaderGlobalBar>
        {state.user && <span className="header-user">{state.user.name}</span>}
        <HeaderGlobalAction
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Light size={20} /> : <Asleep size={20} />}
        </HeaderGlobalAction>
        <div className="header-action">
          <HeaderGlobalAction aria-label={`Cart, ${count} items`} onClick={() => navigate('/checkout')}>
            <ShoppingCart size={20} />
          </HeaderGlobalAction>
          {count > 0 && (
            <span className="header-action__badge" aria-hidden="true">
              {count}
            </span>
          )}
        </div>
        {state.user ? (
          <HeaderGlobalAction
            aria-label="Sign out"
            onClick={() => {
              dispatch({ type: 'logout' });
              navigate('/');
            }}
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        ) : (
          <HeaderGlobalAction aria-label="Sign in" onClick={openLogin}>
            <Login size={20} />
          </HeaderGlobalAction>
        )}
      </HeaderGlobalBar>
    </Header>
  );
}
