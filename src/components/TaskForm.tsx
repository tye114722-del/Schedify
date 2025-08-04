import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Task } from '@/types';

export default function TaskForm({ 
  date, 
  onSubmit,
  onCancel,
  isAdHoc = false
}: {
  date: string;
  onSubmit: (task: Task) => void;
  onCancel?: () => void;
  isAdHoc?: boolean;
}) {
  // 使用传入的 isAdHoc 作为初始状态
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedHours, setEstimatedHours] = useState<number | undefined>();
  const [isTaskAdHoc, setIsTaskAdHoc] = useState(isAdHoc);
  
  // 使用传入的日期作为截止日期默认值
  const [deadline, setDeadline] = useState(date);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 当父组件传递的 isAdHoc 变化时，更新内部状态
  useEffect(() => {
    setIsTaskAdHoc(isAdHoc);
  }, [isAdHoc]);

  // 根据截止日期和预估工时计算开始日期
  useEffect(() => {
    if (deadline && estimatedHours) {
      const deadlineDate = new Date(deadline);
      const requiredDays = Math.ceil(estimatedHours / 8); // 假设每天工作8小时
      
      // 计算开始日期（截止日期往前推所需天数）
      const startDate = new Date(deadlineDate);
      startDate.setDate(startDate.getDate() - requiredDays + 1);
      
      // 格式化日期为 YYYY-MM-DD
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      setStartDate(formatDate(startDate));
      setEndDate(deadline);
    }
  }, [deadline, estimatedHours]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newTask: Task = {
      id: uuidv4(),
      title,
      description,
      date,
      isAdHoc: isTaskAdHoc,
      completed: false,
      order: 0,
      estimatedHours,
      deadline: deadline || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      logs: [],
      totalDuration: 0
    };
    
    onSubmit(newTask);
    resetForm();
  };

  // 重置表单
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEstimatedHours(undefined);
    setIsTaskAdHoc(isAdHoc);
    setDeadline(date); // 重置为传入的日期
    setStartDate('');
    setEndDate('');
  };

  // 处理取消操作
  const handleCancel = () => {
    resetForm();
    if (onCancel) onCancel();
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="space-y-4 relative p-4 bg-white rounded-lg shadow-md border border-gray-200"
    >
      <button
        type="button"
        onClick={handleCancel}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        title="取消"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      <h3 className="font-bold text-lg">{isTaskAdHoc ? '添加临时任务' : '添加新任务'}</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          任务标题 *
        </label>
        <input
          type="text"
          placeholder="输入任务标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
          autoFocus
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          任务描述
        </label>
        <textarea
          placeholder="输入任务描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
          rows={3}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          预估工时 (小时)
        </label>
        <input
          type="number"
          min="0.5"
          step="0.5"
          placeholder="输入预估所需时间"
          value={estimatedHours || ''}
          onChange={(e) => setEstimatedHours(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          截止日期
        </label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            开始日期
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            结束日期
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <div className="flex items-center">
        <input
          type="checkbox"
          id="isAdHoc"
          checked={isTaskAdHoc}
          onChange={(e) => setIsTaskAdHoc(e.target.checked)}
          className="h-4 w-4 text-orange-500 rounded focus:ring-orange-400"
        />
        <label htmlFor="isAdHoc" className="ml-2 text-sm text-gray-700">
          临时任务
        </label>
      </div>
      
      <div className="flex justify-end space-x-2">
        <button 
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
        >
          取消
        </button>
        <button 
          type="submit"
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
        >
          添加任务
        </button>
      </div>
    </form>
  );
}