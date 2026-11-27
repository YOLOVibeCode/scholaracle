'use client';

import Link from 'next/link';
import { ScholarmancyLogo } from '@/components/brand/ScholarmancyLogo';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Bell, Settings, GraduationCap, Calendar, CreditCard, LayoutDashboard, Plug, UserCircle, ListTodo, Mail, CheckSquare, MessageSquare } from 'lucide-react';
import { useStudentView } from '@/lib/contexts/StudentViewContext';
import { openFeedback } from '@/lib/feedback/feedback';
import { useFeedbackInMenu } from '@/lib/feedback/useFeedbackInMenu';
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const parentMenuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: Home },
  { title: 'Students', url: '/dashboard/students', icon: GraduationCap },
  { title: 'Alerts', url: '/dashboard/alerts', icon: Bell },
  { title: 'Agenda', url: '/dashboard/agenda', icon: Calendar },
  { title: 'Courses', url: '/dashboard/courses', icon: BookOpen },
  { title: 'Integrations', url: '/dashboard/integrations', icon: Plug },
  { title: 'Billing', url: '/dashboard/billing', icon: CreditCard },
  { title: 'Account', url: '/dashboard/account', icon: UserCircle },
  { title: 'Email History', url: '/dashboard/email-history', icon: Mail },
  { title: 'Settings', url: '/dashboard/settings', icon: Settings },
];

function getStudentMenuItems(studentId: string) {
  const base = `/dashboard/students/${studentId}/view`;
  return [
    { title: 'Dashboard', url: base, icon: LayoutDashboard },
    { title: 'To Do', url: `${base}/todo`, icon: CheckSquare },
    { title: 'Workflow', url: `/dashboard/students/${studentId}/workflow`, icon: ListTodo },
    { title: 'Agenda', url: `${base}/agenda`, icon: Calendar },
    { title: 'Alerts', url: `${base}/alerts`, icon: Bell },
    { title: 'Courses', url: `${base}/courses`, icon: BookOpen },
    { title: 'Emails', url: `${base}/emails`, icon: Mail },
    { title: 'Back to my dashboard', url: '/dashboard', icon: Home },
  ];
}

/**
 * "Send feedback" at the foot of the menu, on phones only: there the feedback widget's
 * floating button is not drawn, because it sat on top of the page's own buttons.
 */
function SidebarFeedback() {
  const { setOpenMobile } = useSidebar();
  const inMenu = useFeedbackInMenu();
  if (!inMenu) return null;
  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            data-testid="sidebar-send-feedback"
            onClick={() => {
              // Close the drawer first: while it is open it keeps the keyboard focus inside itself.
              setOpenMobile(false);
              openFeedback();
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>Send feedback</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { isStudentView, studentId } = useStudentView();
  const menuItems = isStudentView && studentId ? getStudentMenuItems(studentId) : parentMenuItems;

  return (
    <SidebarComponent>
      <SidebarHeader>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 px-2 py-1">
          <ScholarmancyLogo size={32} />
          <span className="font-semibold text-sm">Scholarmancy</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url}
                        data-testid={`sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFeedback />
    </SidebarComponent>
  );
}

