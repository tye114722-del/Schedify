import { useState, useEffect, useRef, useCallback } from 'react';
import { Task } from '@/types';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  taskColor: string;
  validateTimeRange?: (startTime: string, endTime: string) => boolean;
}

export default function TaskCard({ 
  task, 
  onUpdate, 
  onDelete,
  taskColor,
  validateTimeRange
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [newLog, setNewLog] = useState<{ date: string; startTime: string; endTime: string; duration: number }>({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    duration: 60
  });
  
  const [localTask, setLocalTask] = useState<Task>(task);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalTask(task);
  }, [task]);

  const isTimeRangeOverlap = useCallback((start: string, end: string, date: string) => {
    if (!validateTimeRange) return false;
    
    const otherLogs = localTask.logs?.filter(log => 
      log.date !== date || log.startTime !== start || log.endTime !== end
    ) || [];
    
    return validateTimeRange(start, end, otherLogs);
  }, [validateTimeRange, localTask.logs]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleSave = useCallback(() => {
    if (isEditing) {
      onUpdate(localTask);
      setIsEditing(false);
    }
  }, [isEditing, localTask, onUpdate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, handleSave]);

  const handleCompletedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updatedTask = {
      ...localTask,
      completed: e.target.checked
    };
    setLocalTask(updatedTask);
    onUpdate(updatedTask);
  };

  const handleAdHocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTask(prev => ({
      ...prev,
      isAdHoc: e.target.checked
    }));
  };

  const calculateDuration = (start: string, end: string) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    return endMinutes - startMinutes;
  };

  const handleAddLog = () => {
    if (!newLog.startTime || !newLog.endTime) return;
    
    const duration = calculateDuration(newLog.startTime, newLog.endTime);
    if (duration <= 0) {
      alert("结束时间必须晚于开始时间");
      return;
    }
    
    if (isTimeRangeOverlap(newLog.startTime, newLog.endTime, newLog.date)) {
      alert("该时间段与已有工作记录重叠，请选择其他时间段");
      return;
    }
    
    const log = {
      id: Date.now().toString(),
      ...newLog,
      duration
    };
    
    const updatedLogs = [...(localTask.logs || []), log];
    const totalDuration = updatedLogs.reduce((sum, log) => sum + log.duration, 0);
    
    const updatedTask: Task = {
      ...localTask,
      logs: updatedLogs,
      totalDuration
    };
    
    setLocalTask(updatedTask);
    onUpdate(updatedTask);
    setShowLogForm(false);
    setNewLog({
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: '10:00',
      duration: 60
    });
  };

  const handleDeleteLog = (logId: string) => {
    const updatedLogs = localTask.logs?.filter(log => log.id !== logId) || [];
    const totalDuration = updatedLogs.reduce((sum, log) => sum + log.duration, 0);
    
    const updatedTask: Task = {
      ...localTask,
      logs: updatedLogs,
      totalDuration
    };
    
    setLocalTask(updatedTask);
    onUpdate(updatedTask);
  };

  const progressPercentage = localTask.estimatedHours && localTask.totalDuration
    ? Math.min(100, Math.round((localTask.totalDuration / (localTask.estimatedHours * 60)) * 100))
    : 0;

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), 'MM/dd');
  };

  return (
    <motion.div 
      className={`rounded-lg shadow p-4 mb-3 border ${
        localTask.completed 
          ? 'bg-gray-100 border-gray-200' 
          : taskColor
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      ref={formRef}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={localTask.title}
            onChange={(e) => setLocalTask(prev => ({ ...prev, title: e.target.value }))}
            className="w-full p-2 border rounded"
            placeholder="任务标题"
            autoFocus
          />
          <textarea
            value={localTask.description || ''}
            onChange={(e) => setLocalTask(prev => ({ ...prev, description: e.target.value }))}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="任务描述"
          />
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-gray-600">预估工时 (小时)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={localTask.estimatedHours || ''}
                onChange={(e) => setLocalTask(prev => ({ 
                  ...prev, 
                  estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined 
                }))}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-gray-600">截止日期</label>
              <input
                type="date"
                value={localTask.deadline || ''}
                onChange={(e) => setLocalTask(prev => ({ 
                  ...prev, 
                  deadline: e.target.value || undefined 
                }))}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">开始日期</label>
              <input
                type="date"
                value={localTask.startDate || ''}
                onChange={(e) => setLocalTask(prev => ({ 
                  ...prev, 
                  startDate: e.target.value || undefined 
                }))}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">结束日期</label>
              <input
                type="date"
                value={localTask.endDate || ''}
                onChange={(e) => setLocalTask(prev => ({ 
                  ...prev, 
                  endDate: e.target.value || undefined 
                }))}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
          
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              id={`adHoc-${localTask.id}`}
              checked={localTask.isAdHoc || false}
              onChange={handleAdHocChange}
              className="mr-2 h-4 w-4 text-orange-500 rounded focus:ring-orange-400"
            />
            <label htmlFor={`adHoc-${localTask.id}`} className="text-sm text-gray-700">
              临时任务
            </label>
          </div>
          
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-start">
            <input
              type="checkbox"
              checked={localTask.completed}
              onChange={handleCompletedChange}
              className="mt-1 mr-3 h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
            />
            
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{localTask.title}</h3>
                  {localTask.description && (
                    <p className="text-gray-600 mt-1">{localTask.description}</p>
                  )}
                  
                  <div className="mt-1 text-sm text-gray-500">
                    {localTask.deadline && (
                      <p>截止日期: {formatDate(localTask.deadline)}</p>
                    )}
                    {localTask.startDate && localTask.endDate && (
                      <p>
                        周期: {formatDate(localTask.startDate)} - {formatDate(localTask.endDate)}
                      </p>
                    )}
                  </div>
                  
                  {localTask.estimatedHours && (
                    <div className="mt-1 text-sm text-gray-500">
                      预估工时: {localTask.estimatedHours} 小时
                    </div>
                  )}
                  
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>进度: {progressPercentage}%</span>
                      <span>
                        {Math.floor(localTask.totalDuration / 60)}小时
                        {localTask.totalDuration % 60}分钟
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-blue-500 hover:text-blue-700 transition-colors"
                    title="编辑"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(localTask.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              {localTask.isAdHoc && (
                <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded mt-2">
                  临时任务
                </span>
              )}
            </div>
          </div>
          
          <div className="mt-3 border-t pt-3">
            <div className="flex justify-between items-center mb-2">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                工作记录 {showLogs ? '▲' : '▼'}
              </button>
              
              {showLogs && (
                <button
                  onClick={() => setShowLogForm(!showLogForm)}
                  className="text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                >
                  {showLogForm ? '取消' : '添加记录'}
                </button>
              )}
            </div>
            
            {showLogs && (
              <div>
                {showLogForm && (
                  <div className="bg-gray-50 p-3 rounded mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">日期</label>
                        <input
                          type="date"
                          value={newLog.date}
                          onChange={(e) => setNewLog({...newLog, date: e.target.value})}
                          className="w-full p-1 text-sm border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">开始时间</label>
                        <input
                          type="time"
                          value={newLog.startTime}
                          onChange={(e) => setNewLog({...newLog, startTime: e.target.value})}
                          className="w-full p-1 text-sm border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">结束时间</label>
                        <input
                          type="time"
                          value={newLog.endTime}
                          onChange={(e) => setNewLog({...newLog, endTime: e.target.value})}
                          className="w-full p-1 text-sm border rounded"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleAddLog}
                      className="w-full bg-green-500 text-white py-1 rounded text-sm hover:bg-green-600"
                    >
                      添加工作记录
                    </button>
                  </div>
                )}
                
                {localTask.logs && localTask.logs.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {localTask.logs.map(log => (
                      <div key={log.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                        <div>
                          <span className="font-medium">{format(parseISO(log.date), 'MM/dd')}</span>
                          <span className="mx-2">|</span>
                          <span>{log.startTime} - {log.endTime}</span>
                          <span className="ml-2">({Math.floor(log.duration / 60)}h {log.duration % 60}m)</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">暂无工作记录</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}