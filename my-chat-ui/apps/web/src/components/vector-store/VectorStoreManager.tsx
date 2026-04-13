/**
 * Vector Store Manager Component
 * 
 * Enhanced features:
 * - Multiple collection management
 * - Collection-specific AI behavior
 * - Improved search with highlights
 * - Individual document deletion
 * - Optimized layout
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Database, 
  Search, 
  Trash2, 
  RefreshCw, 
  FileText,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Plus,
  X,
  Settings,
  Sparkles,
  MoreVertical,
  Hash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const API_BASE_URL = "/rag";

interface Document {
  id?: string;
  content: string;
  metadata: {
    source?: string;
    chunk_index?: number;
    total_chunks?: number;
    page_number?: number;
    user_id?: string;
    [key: string]: any;
  };
}

interface Collection {
  name: string;
  description?: string;
  documentCount: number;
  createdAt?: string;
}

interface Stats {
  total_documents: number;
  collection_name: string;
  persist_directory: string;
  user_documents?: number;
}

interface VectorStoreManagerProps {
  userId?: string;
  currentCollection?: string;
  onCollectionChange?: (collection: string) => void;
}

// 默认集合配置
const DEFAULT_COLLECTIONS: Collection[] = [
  { name: "default", description: "默认知识库", documentCount: 0 },
];

// 高亮搜索关键词
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded">
        {part}
      </mark>
    ) : part
  );
}

// 提取匹配片段
function extractSnippet(content: string, query: string, maxLength: number = 150): string {
  if (!query.trim()) return content.slice(0, maxLength);
  
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  
  if (index === -1) return content.slice(0, maxLength);
  
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + query.length + 100);
  
  let snippet = content.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  
  return snippet;
}

export function VectorStoreManager({ 
  userId = "default",
  currentCollection: externalCollection,
  onCollectionChange,
}: VectorStoreManagerProps) {
  // 集合管理状态 - 使用外部传入的集合，如果没有则使用默认值
  const [collections, setCollections] = useState<Collection[]>(DEFAULT_COLLECTIONS);
  const [currentCollection, setCurrentCollection] = useState<string>(externalCollection || "default");
  
  // 当外部集合变化时同步
  useEffect(() => {
    if (externalCollection && externalCollection !== currentCollection) {
      setCurrentCollection(externalCollection);
    }
  }, [externalCollection]);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");
  
  // 文档状态
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingDocIndex, setDeletingDocIndex] = useState<number | null>(null);

  // 加载集合列表
  const fetchCollections = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/collections?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.collections && data.collections.length > 0) {
          // 合并后端数据，保留前端已知的文档数（避免覆盖新创建的集合）
          setCollections(prev => {
            const merged = [...prev];
            data.collections.forEach((backendColl: Collection) => {
              const existingIndex = merged.findIndex(c => c.name === backendColl.name);
              if (existingIndex >= 0) {
                // 保留现有数据，但更新后端提供的文档数（如果后端有数据）
                merged[existingIndex] = {
                  ...merged[existingIndex],
                  documentCount: backendColl.documentCount
                };
              } else {
                // 添加新集合
                merged.push(backendColl);
              }
            });
            return merged;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    }
  }, [userId]);

  // 加载统计信息
  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ 
        user_id: userId,
        collection_name: currentCollection 
      });
      
      const response = await fetch(`${API_BASE_URL}/stats?${params}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      
      const data = await response.json();
      setStats(data);
      
      // 更新当前集合的文档数
      setCollections(prev => prev.map(c => 
        c.name === currentCollection 
          ? { ...c, documentCount: data.user_documents || 0 }
          : c
      ));
    } catch (error) {
      toast.error("获取统计信息失败");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentCollection]);

  // 初始加载
  useEffect(() => {
    fetchCollections();
    fetchStats();
  }, [fetchCollections, fetchStats]);

  // 切换集合时通知父组件
  useEffect(() => {
    onCollectionChange?.(currentCollection);
  }, [currentCollection, onCollectionChange]);

  // 创建新集合
  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      toast.error("请输入集合名称");
      return;
    }
    
    if (collections.some(c => c.name === newCollectionName.trim())) {
      toast.error("集合名称已存在");
      return;
    }
    
    const newCollection: Collection = {
      name: newCollectionName.trim(),
      description: newCollectionDesc.trim() || undefined,
      documentCount: 0, // 新集合初始为空
      createdAt: new Date().toISOString(),
    };
    
    setCollections(prev => [...prev, newCollection]);
    setCurrentCollection(newCollection.name);
    setNewCollectionName("");
    setNewCollectionDesc("");
    setIsCreatingCollection(false);
    toast.success(`创建空集合 "${newCollection.name}" 成功，请上传文档`);
    
    // 重置统计数据为新集合（空）
    setStats({
      total_documents: stats?.total_documents || 0,
      user_documents: 0,
      collection_name: newCollection.name,
      persist_directory: stats?.persist_directory || "",
    });
  };

  // 删除集合
  const handleDeleteCollection = async (collectionName: string) => {
    if (collectionName === "default") {
      toast.error("默认集合不能删除");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/collections/${collectionName}?user_id=${userId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        setCollections(prev => prev.filter(c => c.name !== collectionName));
        if (currentCollection === collectionName) {
          setCurrentCollection("default");
        }
        toast.success(`删除集合 "${collectionName}" 成功`);
        fetchStats();
      }
    } catch (error) {
      toast.error("删除集合失败");
    }
  };

  // 搜索文档
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("请输入搜索关键词");
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${API_BASE_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          user_id: userId,
          collection_name: currentCollection,
          k: 20,
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      
      // 过滤掉不匹配的文档（相似度太低）
      const filteredDocs = data.documents.filter((doc: Document) => {
        const content = doc.content.toLowerCase();
        const query = searchQuery.toLowerCase();
        return content.includes(query) || doc.metadata?.source?.toLowerCase().includes(query);
      });
      
      setSearchResults(filteredDocs);
      
      if (filteredDocs.length === 0) {
        toast.info("未找到包含关键词的文档");
      } else {
        toast.success(`找到 ${filteredDocs.length} 个包含 "${searchQuery}" 的文档`);
      }
    } catch (error) {
      toast.error("搜索失败");
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  // 删除单个文档
  const handleDeleteDocument = async (index: number) => {
    const doc = searchResults[index];
    if (!doc) return;
    
    setDeletingDocIndex(index);
    try {
      const response = await fetch(`${API_BASE_URL}/documents/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          collection_name: currentCollection,
          source: doc.metadata.source,
        }),
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      toast.success(`已删除 "${doc.metadata.source}"`);
      setSearchResults(prev => prev.filter((_, i) => i !== index));
      fetchStats();
    } catch (error) {
      toast.error("删除文档失败");
      console.error(error);
    } finally {
      setDeletingDocIndex(null);
    }
  };

  // 清空集合所有文档
  const handleDeleteAll = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          collection_name: currentCollection,
        }),
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      toast.success(`"${currentCollection}" 集合已清空`);
      setShowDeleteConfirm(false);
      fetchStats();
      setSearchResults([]);
    } catch (error) {
      toast.error("清空失败");
      console.error(error);
    }
  };

  // 展开/收起文档
  const toggleExpand = (index: number) => {
    setExpandedDocs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // 上传完成回调
  const handleUploadComplete = () => {
    fetchStats();
    setShowUpload(false);
  };

  // 当前集合信息
  const currentCollectionInfo = useMemo(() => 
    collections.find(c => c.name === currentCollection),
    [collections, currentCollection]
  );

  return (
    <div className="w-full space-y-4">
      {/* Collection Selector */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">知识库集合</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsCreatingCollection(true)}
            className="h-8"
          >
            <Plus className="w-4 h-4 mr-1" />
            新建
          </Button>
        </div>
        
        {/* Collection List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {collections.map((collection) => (
            <div
              key={collection.name}
              onClick={() => setCurrentCollection(collection.name)}
              className={`
                flex items-center justify-between p-2.5 rounded-lg cursor-pointer
                transition-colors group
                ${currentCollection === collection.name 
                  ? "bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800" 
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent"
                }
              `}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {currentCollection === collection.name && (
                  <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                    {collection.name}
                  </p>
                  {collection.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {collection.description}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {collection.documentCount || 0}
                </span>
                
                {collection.name !== "default" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-32 p-1" align="end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-red-600"
                        onClick={() => handleDeleteCollection(collection.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        删除
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Create Collection Form */}
        {isCreatingCollection && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
            <Input
              placeholder="集合名称（英文）"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              placeholder="描述（可选）"
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="flex-1 h-8"
                onClick={handleCreateCollection}
              >
                创建
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8"
                onClick={() => setIsCreatingCollection(false)}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <Database className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">总文档</p>
            <p className="text-lg font-bold">{isLoading ? "..." : stats?.total_documents || 0}</p>
          </div>
        </Card>

        <Card className="p-3 flex items-center gap-2">
          <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded-lg">
            <FileText className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">当前集合</p>
            <p className="text-lg font-bold">{isLoading ? "..." : stats?.user_documents || 0}</p>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={() => setShowUpload(!showUpload)}
          variant={showUpload ? "secondary" : "default"}
          size="sm"
          className="w-full"
        >
          {showUpload ? "取消" : "上传"}
        </Button>
        
        <Button
          variant="outline"
          onClick={fetchStats}
          disabled={isLoading}
          size="sm"
          className="w-full"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={!stats?.user_documents}
          size="sm"
          className="w-full"
          title="清空当前集合的所有文档"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          <span className="text-xs">清空</span>
        </Button>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
            上传到 "{currentCollection}"
          </h3>
          <FileUpload
            onUploadComplete={handleUploadComplete}
            userId={userId}
            collectionName={currentCollection}
          />
        </Card>
      )}

      {/* Search Section */}
      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            placeholder={`搜索 "${currentCollection}" 中的文档...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 h-9"
          />
          <Button 
            onClick={handleSearch}
            disabled={isSearching}
            size="sm"
            className="h-9 px-3"
          >
            {isSearching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              搜索结果 ({searchResults.length})
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSearchResults([])}
              className="h-7 text-xs"
            >
              清除
            </Button>
          </div>
          
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {searchResults.map((doc, index) => (
              <div
                key={index}
                className="border rounded-lg overflow-hidden dark:border-gray-700 group"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50">
                  <button
                    onClick={() => toggleExpand(index)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                        {doc.metadata.source || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.metadata.chunk_index !== undefined && 
                          `分块 ${doc.metadata.chunk_index + 1}/${doc.metadata.total_chunks}`}
                      </p>
                    </div>
                    {expandedDocs.has(index) ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  
                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                    onClick={() => handleDeleteDocument(index)}
                    disabled={deletingDocIndex === index}
                  >
                    {deletingDocIndex === index ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
                
                {/* Content */}
                {expandedDocs.has(index) ? (
                  <div className="p-3 border-t dark:border-gray-700">
                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                      {highlightText(doc.content, searchQuery)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-3 border-t dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {highlightText(extractSnippet(doc.content, searchQuery), searchQuery)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Delete All Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-5 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <h3 className="text-lg font-semibold">⚠️ 确认清空文档</h3>
            </div>
            
            <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg mb-4">
              <p className="text-red-700 dark:text-red-400 text-sm font-medium mb-1">
                您即将清空以下集合的所有文档：
              </p>
              <p className="text-red-800 dark:text-red-300 text-lg font-bold">
                "{currentCollection}"
              </p>
            </div>
            
            <ul className="text-gray-600 dark:text-gray-400 mb-5 text-sm space-y-1.5">
              <li>• 将删除 <strong>{stats?.user_documents || 0}</strong> 个文档块</li>
              <li>• 此操作<strong>不可撤销</strong></li>
              <li>• 其他集合的文档不受影响</li>
            </ul>
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                size="sm"
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAll}
                size="sm"
              >
                确认清空
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default VectorStoreManager;
