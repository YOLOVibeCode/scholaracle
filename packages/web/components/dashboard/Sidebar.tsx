'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Bell, Settings, GraduationCap, Calendar, CreditCard, LayoutDashboard, Plug, UserCircle, ListTodo, Mail, CheckSquare } from 'lucide-react';
import { useStudentView } from '@/lib/contexts/StudentViewContext';
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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

export function Sidebar() {
  const pathname = usePathname();
  const { isStudentView, studentId } = useStudentView();
  const menuItems = isStudentView && studentId ? getStudentMenuItems(studentId) : parentMenuItems;

  return (
    <SidebarComponent>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
          <Image src="/logo.png" alt="Scholarmancy" width={32} height={32} className="rounded-lg" />
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
    </SidebarComponent>
  );
}

