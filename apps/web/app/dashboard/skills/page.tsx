"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function SkillsPage() {
  const utils = api.useUtils();
  const skillsQuery = api.skills.list.useQuery();
  const createSkillMutation = api.skills.create.useMutation({
    onSuccess: () => utils.skills.list.invalidate(),
  });
  const deleteSkillMutation = api.skills.delete.useMutation({
    onSuccess: () => utils.skills.list.invalidate(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: "",
    description: "",
    content: "",
  });

  const handleCreateSkill = async () => {
    if (!newSkill.name || !newSkill.content) return;
    try {
      await createSkillMutation.mutateAsync(newSkill);
      setNewSkill({ name: "", description: "", content: "" });
      setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create skill");
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (confirm("Delete this skill?")) {
      try {
        await deleteSkillMutation.mutateAsync({ skillId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete skill");
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Skills</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Skill"}
        </Button>
      </div>

      {showCreate && (
        <div className="border rounded p-4 space-y-4 bg-slate-50">
          <Input
            placeholder="Skill name"
            value={newSkill.name}
            onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
          />
          <Input
            placeholder="Description (optional)"
            value={newSkill.description}
            onChange={(e) =>
              setNewSkill({ ...newSkill, description: e.target.value })
            }
          />
          <Textarea
            placeholder="Skill content (markdown)"
            value={newSkill.content}
            onChange={(e) =>
              setNewSkill({ ...newSkill, content: e.target.value })
            }
            className="h-64 font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleCreateSkill}
              disabled={!newSkill.name || !newSkill.content || createSkillMutation.isPending}
            >
              {createSkillMutation.isPending ? "Saving..." : "Create"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {skillsQuery.data?.map((skill) => (
          <div
            key={skill.id}
            className="border rounded p-4 flex justify-between items-start"
          >
            <div className="flex-1">
              <h3 className="font-semibold">{skill.name}</h3>
              {skill.description && (
                <p className="text-sm text-gray-600">{skill.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                {skill.content}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDeleteSkill(skill.id)}
              disabled={deleteSkillMutation.isPending}
            >
              Delete
            </Button>
          </div>
        ))}
        {!skillsQuery.data?.length && (
          <p className="text-gray-500 text-center py-8">
            No skills yet. Create one to get started.
          </p>
        )}
      </div>
    </div>
  );
}
