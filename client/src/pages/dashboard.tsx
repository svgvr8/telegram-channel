import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTemplateSchema, type Template } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const form = useForm({
    resolver: zodResolver(insertTemplateSchema),
    defaultValues: {
      name: "",
      html: "",
      css: "",
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (data: Parameters<typeof form.handleSubmit>[0]) => {
      const res = await apiRequest("POST", "/api/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      form.reset();
      toast({
        title: "Template created",
        description: "Your template has been saved successfully.",
      });
    },
  });

  const postImage = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/post`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Image posted",
        description: "The image has been posted to Telegram successfully.",
      });
    },
  });

  return (
    <div className="container mx-auto py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Create Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createTemplate.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="html"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HTML</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={6} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="css"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CSS</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={6} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createTemplate.isPending}>
                  Create Template
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {templates.map((template) => (
                <div key={template.id} className="flex items-center justify-between p-4 border rounded">
                  <div>{template.name}</div>
                  <Button
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      postImage.mutate(template.id);
                    }}
                    disabled={postImage.isPending && selectedTemplate === template.id}
                  >
                    {postImage.isPending && selectedTemplate === template.id ? "Posting..." : "Post to Telegram"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}