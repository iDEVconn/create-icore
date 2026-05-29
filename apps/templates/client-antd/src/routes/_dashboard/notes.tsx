import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageLayout } from '../../components/PageLayout';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useUpdateNote,
  type Note,
} from '../../queries/notes';

const PAGE_SIZE = 20;

interface NoteFormValues {
  title: string;
  body: string;
}

function NotesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isPending } = useNotesList(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [form] = Form.useForm<NoteFormValues>();

  function openNew() {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    form.setFieldsValue({ title: note.title, body: note.body });
    setOpen(true);
  }

  async function handleSubmit(values: NoteFormValues) {
    if (editing) {
      await updateNote.mutateAsync({ id: editing.id, patch: values });
    } else {
      await createNote.mutateAsync(values);
    }
    setOpen(false);
  }

  const columns: ColumnsType<Note> = [
    { title: t('notes.noteTitle'), dataIndex: 'title', key: 'title' },
    {
      title: t('notes.noteBody'),
      dataIndex: 'body',
      key: 'body',
      ellipsis: true,
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      align: 'right',
      render: (_: unknown, note: Note) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(note)}>
            {t('notes.edit')}
          </Button>
          <Popconfirm
            title={t('notes.confirmDelete')}
            onConfirm={() => deleteNote.mutate(note.id)}
            okText={t('notes.delete')}
            cancelText={t('notes.cancel')}
          >
            <Button type="link" size="small" danger>
              {t('notes.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageLayout
      title={t('notes.title')}
      extra={
        <Button type="primary" onClick={openNew}>
          {t('notes.new')}
        </Button>
      }
    >
      {data?.items?.length === 0 && !isPending ? (
        <Typography.Text type="secondary">{t('notes.empty')}</Typography.Text>
      ) : (
        <Table<Note>
          rowKey="id"
          loading={isPending}
          dataSource={data?.items ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
        />
      )}

      <Modal
        title={editing ? t('notes.edit') : t('notes.new')}
        open={open}
        onCancel={() => setOpen(false)}
        confirmLoading={createNote.isPending || updateNote.isPending}
        okText={t('notes.save')}
        cancelText={t('notes.cancel')}
        onOk={() => form.submit()}
      >
        <Form<NoteFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="title"
            label={t('notes.noteTitle')}
            rules={[{ required: true, message: `${t('notes.noteTitle')} is required` }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="body" label={t('notes.noteBody')}>
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/notes')({
  component: NotesPage,
});
