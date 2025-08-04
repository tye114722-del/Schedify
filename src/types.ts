export interface TaskLog {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // minutes
}

export interface Task {
  id: string;
  title: string;
  description: string; // 保持为必填字段
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isAdHoc: boolean;
  order: number;
  completed: boolean;
  estimatedHours?: number;
  completedAt?: string;
  
  // 新增改进字段（保持可选）
  category?: 'work' | 'study' | 'life' | 'other'; // 任务分组
  tags?: string[]; // 任务标签
  priority?: 'high' | 'medium' | 'low'; // 任务优先级
  recurrence?: { // 重复规则
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number; // 重复间隔（默认1）
    endDate?: string; // 结束日期 YYYY-MM-DD
    exceptions?: string[]; // 例外日期 YYYY-MM-DD
  };
  projectId?: string | null; // 关联的项目ID
  
  // 新增功能字段
  deadline?: string; // 截止日期 YYYY-MM-DD
  startDate?: string; // 任务开始日期 YYYY-MM-DD
  endDate?: string; // 任务结束日期 YYYY-MM-DD
  logs?: TaskLog[]; // 工作记录
  totalDuration?: number; // 累计工作时长(分钟)
}

export interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tasks: string[]; // 保持原有的任务关联方式
}