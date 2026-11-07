import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './store.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import Dashboard from './components/Dashboard.jsx';
import TodayPage from './components/TodayPage.jsx';
import StudyNext from './components/StudyNext.jsx';
import ImportScreenshots from './components/ImportScreenshots.jsx';
import LibraryPage from './components/LibraryPage.jsx';
import RevisionQueue from './components/RevisionQueue.jsx';
import CalendarView from './components/CalendarView.jsx';
import Settings from './components/Settings.jsx';
import CheckInModal from './components/CheckInModal.jsx';
import PomodoroTimer from './components/PomodoroTimer.jsx';
import { useDailyReminder } from './lib/useDailyReminder.js';

const PAGES = {
  dashboard: Dashboard,
  today: TodayPage,
  next: StudyNext,
  import: ImportScreenshots,
  library: LibraryPage,
  revision: RevisionQueue,
  calendar: CalendarView,
  settings: Settings,
};

export default function App() {
  const { page } = useApp();
  useDailyReminder();
  const Page = PAGES[page] || Dashboard;
  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[264px]">
        <Header />
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-36 pt-2 sm:px-6 lg:px-10 lg:pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <PomodoroTimer />
      <CheckInModal />
    </div>
  );
}
