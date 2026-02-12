'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Bell, Settings, GraduationCap, Calendar, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const menuItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: Home,
  },
  {
    title: 'Students',
    url: '/dashboard/students',
    icon: GraduationCap,
  },
  {
    title: 'Alerts',
    url: '/dashboard/alerts',
    icon: Bell,
  },
  {
    title: 'Agenda',
    url: '/dashboard/agenda',
    icon: Calendar,
  },
  {
    title: 'Courses',
    url: '/dashboard/courses',
    icon: BookOpen,
  },
  {
    title: 'Billing',
    url: '/dashboard/billing',
    icon: CreditCard,
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <SidebarComponent>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Scholaracle</SidebarGroupLabel>
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

