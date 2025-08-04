'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  format, 
  addDays, 
  subDays, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

import TaskForm from '@/components/TaskForm';
import TaskCard from '@/components/TaskCard';

import { Task } from '@/types';

import { motion, AnimatePresence } from 'framer-motion';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrag, useDrop } from 'react-dnd';

// 新增类型定义
interface WeeklyTaskRecord {
  '任务名称': string;
  '任务描述': string;
  '开始时间': string;
  '结束时间': string;
  '持续时间': string;
  '总时长': string;
  '状态': string;
}


const isTimeRangeOverlap = (
  newStart: string, 
  newEnd: string, 
  existingLogs: { startTime: string; endTime: string }[]
): boolean => {
  const newStartTime = new Date(`1970-01-01T${newStart}`).getTime();
  const newEndTime = new Date(`1970-01-01T${newEnd}`).getTime();
  
  return existingLogs.some(log => {
    const logStartTime = new Date(`1970-01-01T${log.startTime}`).getTime();
    const logEndTime = new Date(`1970-01-01T${log.endTime}`).getTime();
    
    return (
      (newStartTime >= logStartTime && newStartTime < logEndTime) ||
      (newEndTime > logStartTime && newEndTime <= logEndTime) ||
      (newStartTime <= logStartTime && newEndTime >= logEndTime)
    );
  });
};

const shouldTaskAppearOnDate = (task: Task, dateStr: string): boolean => {
  if (task.isAdHoc) {
    return task.date === dateStr;
  }
  
  if (task.startDate && task.endDate) {
    const current = new Date(dateStr).getTime();
    const start = new Date(task.startDate).getTime();
    const end = new Date(task.endDate).getTime();
    
    return current >= start && current <= end;
  }
  
  return task.date === dateStr;
};

const generateTaskColor = (id: string) => {
  const colors = [
    'bg-blue-100 border-blue-200',
    'bg-green-100 border-green-200',
    'bg-yellow-100 border-yellow-200',
    'bg-purple-100 border-purple-200',
    'bg-pink-100 border-pink-200',
    'bg-indigo-100 border-indigo-200',
    'bg-teal-100 border-teal-200',
  ];
  
  const charSum = id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[charSum % colors.length];
};

const DraggableTaskCard = ({ 
  task, 
  index, 
  moveTask, 
  onUpdate, 
  onDelete,
  taskColor
}: {
  task: Task;
  index: number;
  moveTask: (dragIndex: number, hoverIndex: number) => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  taskColor: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: 'TASK',
    item: { index, id: task.id },
    canDrag: !task.completed,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'TASK',
    hover(item: { index: number; id: string }) {
      if (!ref.current || task.completed) return;
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      if (dragIndex === hoverIndex) return;
      
      moveTask(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className={`cursor-move ${task.completed ? 'cursor-default' : ''}`}
    >
      <TaskCard 
        task={task} 
        onUpdate={onUpdate} 
        onDelete={onDelete}
        taskColor={taskColor}
        validateTimeRange={(startTime, endTime) => 
          isTimeRangeOverlap(startTime, endTime, task.logs || [])
        }
      />
    </div>
  );
};

export default function ScheduleManager() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [monthTasks, setMonthTasks] = useState<Record<string, Task[]>>({});
  const [view, setView] = useState<'day' | 'month'>('day');
  const [touchStartX, setTouchStartX] = useState(0);
  const [direction, setDirection] = useState(0);
  const prevDirectionRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isAdHoc, setIsAdHoc] = useState(false);

  const taskTypeRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const clickedOnForm = formRef.current?.contains(e.target as Node);
      const clickedOnTaskType = taskTypeRef.current?.contains(e.target as Node);
      
      if (!clickedOnForm && !clickedOnTaskType) {
        setShowTaskForm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const { incompleteTasks, completedTasks } = useMemo(() => {
    const incomplete: Task[] = [];
    const completed: Task[] = [];
    
    tasks.forEach(task => {
      if (task.completed) {
        completed.push(task);
      } else {
        incomplete.push(task);
      }
    });
    
    incomplete.sort((a, b) => a.order - b.order);
    completed.sort((a, b) => {
      const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return dateB - dateA;
    });
    
    return {
      incompleteTasks: incomplete,
      completedTasks: completed
    };
  }, [tasks]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        if (view === 'day') nextDay();
        else nextMonth();
      } else {
        if (view === 'day') prevDay();
        else prevMonth();
      }
    }
  };

  const deleteTask = useCallback(async (taskId: string) => {
    setLoading(true);
    try {
      await db.deleteTask(taskId);
      setRefreshTrigger(prev => prev + 1);
      setTaskToDelete(null);
    } catch (error) {
      console.error('删除任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestDelete = (id: string) => {
    setTaskToDelete(id);
  };
  
  const nextDay = useCallback(() => {
    setDirection(1);
    setCurrentDate(addDays(currentDate, 1));
  }, [currentDate]);

  const prevDay = useCallback(() => {
    setDirection(-1);
    setCurrentDate(subDays(currentDate, 1));
  }, [currentDate]);

  const nextMonth = useCallback(() => {
    setDirection(1);
    setCurrentDate(addMonths(currentDate, 1));
  }, [currentDate]);

  const prevMonth = useCallback(() => {
    setDirection(-1);
    setCurrentDate(subMonths(currentDate, 1));
  }, [currentDate]);

  const goToday = () => {
    setDirection(0);
    setCurrentDate(new Date());
  };

  const changeView = (newView: 'day' | 'month') => {
    setDirection(0);
    setView(newView);
  };

  const handleDateClick = (day: Date) => {
    setCurrentDate(day);
    setView('day');
  };


  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      if (view === 'day') prevDay();
      else prevMonth();
    } else if (e.key === 'ArrowRight') {
      if (view === 'day') nextDay();
      else nextMonth();
    } else if (e.key === 't' || e.key === 'T') {
      goToday();
    } else if (e.key === 'Escape' && showTaskForm) {
      setShowTaskForm(false);
    }
  }, [view, showTaskForm, nextDay, nextMonth, prevDay, prevMonth]); // 添加所有依赖项
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const allTasks = await db.getAllTasks();
      const filteredTasks = allTasks.filter(task => 
        shouldTaskAppearOnDate(task, dateStr)
      );
      const tasksWithOrder = filteredTasks.map((task, index) => ({
        ...task,
        order: task.order ?? index
      }));
      
      setTasks(tasksWithOrder);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  const loadMonthTasks = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const allTasks = await db.getAllTasks();
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const grouped: Record<string, Task[]> = {};
      
      daysInMonth.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        grouped[dateStr] = [];
      });
      
      allTasks.forEach(task => {
        daysInMonth.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          if (shouldTaskAppearOnDate(task, dateStr)) {
            grouped[dateStr].push(task);
          }
        });
      });
      
      setMonthTasks(grouped);
    } catch (error) {
      console.error('加载月任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    if (view === 'day') {
      loadTasks();
    } else {
      loadMonthTasks();
    }
  }, [currentDate, view, refreshTrigger, loadTasks, loadMonthTasks]);

  useEffect(() => {
    if (direction !== 0) {
      const timer = setTimeout(() => {
        setDirection(0);
        prevDirectionRef.current = direction;
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [direction]);

  const handleAddTask = useCallback(async (task: Omit<Task, 'id'>) => {
    setLoading(true);
    try {
      const newTask = {
        ...task,
        order: incompleteTasks.length,
        logs: [],
        totalDuration: 0
      };
      
      const createdTask = await db.addTask(newTask);
      setRefreshTrigger(prev => prev + 1);
      setShowTaskForm(false);
      setIsAdHoc(false);
      return createdTask;
    } catch (error) {
      console.error('添加任务失败:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [incompleteTasks]);

  const handleUpdateTask = useCallback(async (task: Task) => {
    setLoading(true);
    try {
      const updatedTask = { ...task };
      const originalTask = tasks.find(t => t.id === task.id);
      if (!originalTask) return;
      
      if (originalTask.completed !== task.completed) {
        updatedTask.completedAt = task.completed ? new Date().toISOString() : undefined;
      }
      
      await db.updateTask(updatedTask);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('更新任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [tasks]);

  const moveTask = useCallback((dragIndex: number, hoverIndex: number) => {
    setTasks((prevTasks) => {
      const newTasks = [...prevTasks];
      const incomplete = newTasks.filter(t => !t.completed);
      const dragId = incomplete[dragIndex]?.id;
      const hoverId = incomplete[hoverIndex]?.id;
      
      if (!dragId || !hoverId) return prevTasks;
      
      const dragActualIndex = newTasks.findIndex(t => t.id === dragId);
      const hoverActualIndex = newTasks.findIndex(t => t.id === hoverId);
      
      if (dragActualIndex === -1 || hoverActualIndex === -1) return prevTasks;
      
      const [draggedTask] = newTasks.splice(dragActualIndex, 1);
      newTasks.splice(hoverActualIndex, 0, draggedTask);
      
      let orderCounter = 0;
      const updatedTasks = newTasks.map(task => {
        if (!task.completed) {
          return {
            ...task,
            order: orderCounter++
          };
        }
        return task;
      });
      
      const tasksToUpdate = updatedTasks.filter(t => !t.completed);
      db.batchUpdateTaskOrder(tasksToUpdate);
      
      return updatedTasks;
    });
  }, []);

  const exportWeeklyReport = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const startOfWeekDate = startOfWeek(today, { weekStartsOn: 1 });
      const endOfWeekDate = endOfWeek(today, { weekStartsOn: 1 });
      const allTasks = await db.getAllTasks();
      const weeklyData: Record<string, WeeklyTaskRecord[]> = {};
      const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      
      for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeekDate);
        day.setDate(startOfWeekDate.getDate() + i);
        const dateStr = format(day, 'yyyy-MM-dd');
        weeklyData[days[i]] = [];
        
        const dailyTasks = allTasks.filter(task => shouldTaskAppearOnDate(task, dateStr));
        
        dailyTasks.forEach(task => {
          if (task.logs && task.logs.length > 0) {
            task.logs.forEach(log => {
              weeklyData[days[i]].push({
                '任务名称': task.title,
                '任务描述': task.description || '',
                '开始时间': log.startTime,
                '结束时间': log.endTime,
                '持续时间': `${Math.floor(log.duration/60)}小时${log.duration%60}分钟`,
                // 修复: 处理 totalDuration 可能为 undefined 的情况
                '总时长': `${Math.floor((task.totalDuration || 0)/60)}小时${(task.totalDuration || 0)%60}分钟`,
                '状态': task.completed ? '已完成' : '进行中'
              });
            });
          } else {
            weeklyData[days[i]].push({
              '任务名称': task.title,
              '任务描述': task.description || '',
              '开始时间': '无记录',
              '结束时间': '无记录',
              '持续时间': '0分钟',
              // 修复: 处理 totalDuration 可能为 undefined 的情况
              '总时长': `${Math.floor((task.totalDuration || 0)/60)}小时${(task.totalDuration || 0)%60}分钟`,
              '状态': task.completed ? '已完成' : '进行中'
            });
          }
        });
        
        if (weeklyData[days[i]].length === 0) {
          weeklyData[days[i]].push({
            '任务名称': '无任务记录',
            '任务描述': '',
            '开始时间': '',
            '结束时间': '',
            '持续时间': '',
            '总时长': '',
            '状态': ''
          });
        }
      }
      
      const wb = XLSX.utils.book_new();
      
      days.forEach(day => {
        const ws = XLSX.utils.json_to_sheet(weeklyData[day]);
        XLSX.utils.book_append_sheet(wb, ws, day);
      });
      
      const summaryData = days.map(day => ({
        '日期': day,
        '任务数量': weeklyData[day].filter(item => item['任务名称'] !== '无任务记录').length,
        '总工作时间': weeklyData[day].reduce((sum, item) => {
          if (item['持续时间']) {
            const match = item['持续时间'].match(/(\d+)小时(\d+)分钟/);
            if (match) {
              return sum + parseInt(match[1]) * 60 + parseInt(match[2]);
            }
          }
          return sum;
        }, 0)
      }));
      
      // 创建新数组用于导出，避免修改原始数据
      const summarySheet = XLSX.utils.json_to_sheet(summaryDataForExport);
      XLSX.utils.book_append_sheet(wb, summarySheet, '周汇总');
      
      const weekRange = `${format(startOfWeekDate, 'yyyyMMdd')}-${format(endOfWeekDate, 'yyyyMMdd')}`;
      XLSX.writeFile(wb, `工作周报_${weekRange}.xlsx`);
      
    } catch (error) {
      console.error('导出周报失败:', error);
      alert('导出周报失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const CalendarView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const startDay = monthStart.getDay();
    const endDay = monthEnd.getDay();
    const prevMonthDays = Array.from({ length: startDay }, (_, i) => 
      subDays(monthStart, startDay - i)
    );
    const nextMonthDays = Array.from({ length: 6 - endDay }, (_, i) => 
      addDays(monthEnd, i + 1)
    );
    
    return (
      <div className="grid grid-cols-7 gap-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="text-center font-bold p-2 text-gray-700 bg-gray-100 rounded">
            {day}
          </div>
        ))}
        
        {prevMonthDays.map(day => (
          <div 
            key={day.toString()}
            className="text-center p-1 border rounded min-h-[100px] flex flex-col bg-gray-50 text-gray-400"
          >
            <div className="text-sm font-semibold">{format(day, 'd')}</div>
          </div>
        ))}
        
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayTasks = monthTasks[dateKey] || [];
          const isToday = isSameDay(day, new Date());
          const isCurrent = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
          
          return (
            <div 
              key={day.toString()}
              className={`text-center p-1 border rounded min-h-[100px] flex flex-col cursor-pointer
                ${isToday ? 'border-2 border-blue-500' : ''}
                ${isCurrent ? 'bg-blue-100' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => handleDateClick(day)}
            >
              <div className="flex justify-between items-center">
                <div className={`text-sm font-semibold ${isToday ? 'text-blue-600' : ''}`}>
                  {format(day, 'd')}
                </div>
                {dayTasks.length > 0 && (
                  <span className="text-xs bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    {dayTasks.length}
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto mt-1 space-y-1 max-h-[60px]">
                {dayTasks.slice(0, 3).map(task => (
                  <div 
                    key={task.id} 
                    className={`text-xs truncate p-1 rounded border ${
                      task.completed 
                        ? 'bg-gray-100 border-gray-200 text-gray-500' 
                        : 'bg-blue-50 border-blue-100'
                    }`}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-xs text-gray-500 text-center">
                    +{dayTasks.length - 3}个任务
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {nextMonthDays.map(day => (
          <div 
            key={day.toString()}
            className="text-center p-1 border rounded min-h-[100px] flex flex-col bg-gray-50 text-gray-400"
          >
            <div className="text-sm font-semibold">{format(day, 'd')}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="max-w-6xl mx-auto p-4 min-h-screen bg-gray-50">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-4 text-blue-700">日程管理系统</h1>
          
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div className="flex space-x-2">
              <button 
                onClick={() => changeView('day')} 
                className={`px-4 py-2 rounded transition-all ${
                  view === 'day' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                每日视图
              </button>
              <button 
                onClick={() => changeView('month')} 
                className={`px-4 py-2 rounded transition-all ${
                  view === 'month' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                月计划
              </button>
            </div>
            
            <div className="flex space-x-2">
              <button 
                onClick={exportWeeklyReport}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors shadow flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                导出周报
              </button>
              
              <button 
                onClick={goToday}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shadow flex items-center"
                title="回到今天 (快捷键: T)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                今天
              </button>
            </div>
          </div>
        </header>
        
        {loading && (
          <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg flex items-center z-50">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        )}
        
        <AnimatePresence mode="wait">
          <motion.div
            key={view === 'day' ? currentDate.toISOString() : format(currentDate, 'yyyy-MM')}
            initial={{ 
              opacity: 0, 
              x: direction === 1 ? 50 : direction === -1 ? -50 : 0 
            }}
            animate={{ 
              opacity: 1, 
              x: 0 
            }}
            exit={{ 
              opacity: 0, 
              x: direction === 1 ? -50 : direction === -1 ? 50 : 0 
            }}
            transition={{ duration: 0.2 }}
          >
            {view === 'month' ? (
              <div className="mb-8">
                <div className="flex justify-center items-center mb-6">
                  <button 
                    onClick={prevMonth}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center"
                    title="上个月"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-1">上个月</span>
                  </button>
                  
                  <h2 className="text-2xl font-bold mx-4 min-w-[180px] text-center text-blue-700">
                    {format(currentDate, 'yyyy年MM月')}
                  </h2>
                  
                  <button 
                    onClick={nextMonth}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center"
                    title="下个月"
                  >
                    <span className="mr-1">下个月</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                
                <div className="bg-white rounded-xl shadow-md p-4">
                  <CalendarView />
                </div>
                
                <div className="mt-6 bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-bold text-blue-700 mb-2">月视图说明</h3>
                  <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                    <li>点击日期可以切换到该日的详细视图</li>
                    <li>蓝色边框表示今天是当前日期</li>
                    <li>数字角标显示当天的任务数量</li>
                    <li>每个日期格子里显示最多3个任务标题</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div 
                className="bg-white rounded-xl shadow-md p-6"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
                  <div className="flex items-center mb-4 sm:mb-0">
                    <button 
                      onClick={prevDay}
                      className="p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center"
                      title="前一天"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="ml-1">前一天</span>
                    </button>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-blue-700">
                    {format(currentDate, 'yyyy年MM月dd日')}
                  </h2>
                  
                  <div className="flex items-center">
                    <button 
                      onClick={nextDay}
                      className="p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center"
                      title="后一天"
                    >
                      <span className="mr-1">后一天</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-blue-700 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        今日任务
                      </h3>
                      
                      <button
                        onClick={() => {
                          setShowTaskForm(!showTaskForm);
                          setIsAdHoc(false);
                        }}
                        className="flex items-center px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        添加任务
                      </button>
                    </div>
                    
                    {showTaskForm && (
                      <div 
                        ref={taskTypeRef}
                        className="mb-4 flex justify-center"
                      >
                        <div className="inline-flex rounded-md shadow-sm" role="group">
                          <button
                            type="button"
                            className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                              !isAdHoc 
                                ? 'bg-blue-600 text-white border-blue-600' 
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                            onClick={() => setIsAdHoc(false)}
                          >
                            常规任务
                          </button>
                          <button
                            type="button"
                            className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
                              isAdHoc 
                                ? 'bg-orange-500 text-white border-orange-500' 
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                            onClick={() => setIsAdHoc(true)}
                          >
                            临时任务
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {showTaskForm && (
                      <motion.div
                        ref={formRef}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-6"
                      >
                        <TaskForm 
                          date={format(currentDate, 'yyyy-MM-dd')} 
                          onSubmit={handleAddTask} 
                          onCancel={() => setShowTaskForm(false)}
                          isAdHoc={isAdHoc}
                        />
                      </motion.div>
                    )}
                    
                    {tasks.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-8 text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500">今日暂无任务</p>
                        <p className="text-gray-400 text-sm mt-2">
                          {showTaskForm 
                            ? "请填写任务信息" 
                            : "点击右上角按钮添加新任务"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {incompleteTasks.length > 0 && (
                          <div>
                            <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              未完成的任务 ({incompleteTasks.length})
                            </h4>
                            <div className="space-y-3">
                              {incompleteTasks.map((task, index) => (
                                <DraggableTaskCard 
                                  key={task.id} 
                                  task={task} 
                                  index={index}
                                  moveTask={moveTask}
                                  onUpdate={handleUpdateTask}
                                  onDelete={requestDelete}
                                  taskColor={generateTaskColor(task.id)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {completedTasks.length > 0 && (
                          <div>
                            <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              已完成的任务 ({completedTasks.length})
                            </h4>
                            <div className="space-y-3">
                              {completedTasks.map((task) => (
                                <div key={task.id}>
                                  <TaskCard 
                                    task={task} 
                                    onUpdate={handleUpdateTask}
                                    onDelete={requestDelete}
                                    taskColor="bg-gray-100 border-gray-200"
                                    validateTimeRange={(startTime, endTime) => 
                                      isTimeRangeOverlap(startTime, endTime, task.logs || [])
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {taskToDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              onClick={() => setTaskToDelete(null)}
            >
              <motion.div 
                className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  确认删除
                </h3>
                
                <p className="mb-6 text-gray-700">
                  您确定要删除这个任务吗？此操作不可撤销，任务将被永久删除。
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setTaskToDelete(null)}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => deleteTask(taskToDelete)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    确认删除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DndProvider>
  );
}