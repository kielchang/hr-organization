import { NavLink, Outlet } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Title1,
} from '@fluentui/react-components';
import {
  Organization24Regular,
  People24Regular,
  History24Regular,
  Diagram24Regular,
  Table24Regular,
} from '@fluentui/react-icons';
import { DataToolbar } from './DataToolbar';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  nav: {
    width: '220px',
    padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    textDecoration: 'none',
    color: tokens.colorNeutralForeground1,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navLinkActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    padding: tokens.spacingVerticalL,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: {
    flex: 1,
    padding: tokens.spacingVerticalL,
    overflow: 'auto',
  },
});

const navItems = [
  { to: '/', label: '人員與歸屬', icon: <People24Regular /> },
  { to: '/groups', label: '組別管理', icon: <Organization24Regular /> },
  { to: '/org-chart', label: '組織圖', icon: <Diagram24Regular /> },
  { to: '/changelog', label: '調整紀錄', icon: <History24Regular /> },
  { to: '/csv-import', label: 'CSV 匯入', icon: <Table24Regular /> },
];

export function Layout() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <aside className={styles.nav}>
        <Title1>HR 組織</Title1>
        <Text className="nav-subtitle">架構調整工具</Text>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ''}`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <DataToolbar />
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
