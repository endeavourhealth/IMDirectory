<template>
  <Dialog
    id="members-comparison-dialog"
    :auto-z-index="true"
    :closable="false"
    :contentStyle="{ flexGrow: '100', display: 'flex', flexDirection: 'column' }"
    :maximizable="true"
    :modal="true"
    :style="{ minWidth: '90vw', minHeight: '90vh', display: 'flex', flexFlow: 'column nowrap' }"
    :visible="true"
  >
    <template #header>
      <strong class="comparison-title">Compare members</strong>
    </template>

    <div class="comparison-content">
      <div class="comparison-toolbar">
        <div class="comparison-summary" data-testid="members-comparison-summary">
          <Tag :value="`${comparison.added} added`" icon="fa-solid fa-plus" severity="success" />
          <Tag :value="`${comparison.removed} removed`" icon="fa-solid fa-minus" severity="danger" />
          <Tag :value="`${comparison.unchanged} unchanged`" severity="secondary" />
        </div>
        <div class="comparison-filters">
          <label class="inactive-toggle">
            <ToggleSwitch v-model="includeInactive" :disabled="loading" data-testid="members-comparison-include-inactive" inputId="include-inactive" />
            <span>Include inactive concepts</span>
          </label>
          <InputText v-model="filterText" data-testid="members-comparison-filter" placeholder="Filter by name or code" />
          <SelectButton v-model="viewMode" :allowEmpty="false" :options="viewModes" optionLabel="label" optionValue="value" />
        </div>
      </div>

      <div v-if="loading" class="comparison-loading" data-testid="members-comparison-loading"><ProgressSpinner /></div>
      <template v-else>
        <Message v-if="loadError" :closable="false" data-testid="members-comparison-error" severity="error"> Unable to load members. {{ loadError }} </Message>
        <Message v-else-if="truncated" :closable="false" severity="warn">
          Not all members were loaded, so some members may be wrongly shown as added or removed.
        </Message>
        <Message v-else-if="!comparison.added && !comparison.removed" :closable="false" severity="info">
          The new definition generates the same members as those currently saved.
        </Message>
      </template>

      <div v-if="!loading" :class="{ 'with-hierarchy': selectedIri }" class="comparison-panels">
        <div v-for="panel in panels" :key="panel.key" :data-testid="`members-comparison-${panel.key}`" class="comparison-panel">
          <div class="panel-header">
            <span class="panel-title">{{ panel.title }}</span>
            <span class="panel-count">{{ panel.total }} members</span>
          </div>
          <DataTable
            :rowClass="rowClass"
            :value="panel.members"
            :virtualScrollerOptions="{ itemSize: 38 }"
            class="p-datatable-sm"
            dataKey="iri"
            scrollHeight="60vh"
            scrollable
            showGridlines
            @row-click="onRowClick"
          >
            <template #empty>{{ panel.emptyMessage }}</template>
            <Column header="" style="width: 2.5rem">
              <template #body="{ data }: { data: ComparedMember }">
                <i v-if="data.change === 'added'" v-tooltip="'Added by the new definition'" class="fa-solid fa-plus" />
                <i v-else-if="data.change === 'removed'" v-tooltip="'Removed by the new definition'" class="fa-solid fa-minus" />
              </template>
            </Column>
            <Column field="name" header="Name">
              <template #body="{ data }: { data: ComparedMember }">
                {{ data.code + " | " + (data.name ?? data.iri) }}
              </template>
            </Column>
            <Column header="Status" style="width: 15%">
              <template #body="{ data }: { data: ComparedMember }">{{ isInactive(data) ? "Inactive" : "Active" }}</template>
            </Column>
            <Column v-if="panel.key === 'current'" header="" style="width: 3rem">
              <template #body="{ data }: { data: ComparedMember }">
                <Button
                  v-if="data.change === 'removed'"
                  v-tooltip="'Add to definition'"
                  :data-testid="`add-member-${data.code}`"
                  icon="fa-solid fa-arrow-right"
                  rounded
                  size="small"
                  text
                  @click.stop="emit('addMember', data)"
                />
              </template>
            </Column>
          </DataTable>
        </div>
        <div v-if="selectedIri" class="comparison-panel hierarchy-panel" data-testid="members-comparison-hierarchy">
          <div class="panel-header">
            <span class="panel-title">Hierarchy</span>
            <Button
              v-tooltip="'Close hierarchy'"
              data-testid="close-hierarchy-button"
              icon="fa-solid fa-xmark"
              rounded
              severity="secondary"
              size="small"
              text
              @click="selectedIri = undefined"
            />
          </div>
          <div class="hierarchy-content">
            <SecondaryTree :entityIri="selectedIri" @row-clicked="(iri: string) => (selectedIri = iri)" @row-control-clicked="openInNewTab" />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button data-testid="close-members-comparison-button" icon="fa-solid fa-xmark" label="Close" severity="secondary" @click="emit('closeDialog')" />
    </template>
  </Dialog>
</template>

<script lang="ts" setup>
import { type Ref, computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Query, SearchResponse, TTIriRef } from "@endeavour/vue-library/models";
import type { DataTableRowClickEvent } from "primevue/datatable";
import SecondaryTree from "@/components/shared/SecondaryTree.vue";
import { useDirectService } from "@/composables/useDirectService";
import { type ComparedMember, compareMembers, isInactive, isTruncated } from "@/helpers/MemberComparison";
import { ECLQueryRequest } from "@/models";
import { SetService } from "@/services";
import { useFilterStore } from "@/stores/filterStore";

interface Props {
  /** The new definition to generate members from */
  query: Query;
  /** Iri of the saved set whose current members are compared */
  setIri: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  closeDialog: [];
  /** A saved member, removed by the new definition, that the user wants added to the definition */
  addMember: [member: ComparedMember];
}>();

type ViewMode = "all" | "changes";
const viewModes: { label: string; value: ViewMode }[] = [
  { label: "All members", value: "all" },
  { label: "Changes only", value: "changes" }
];
const viewMode = ref<ViewMode>("all");
const filterText = ref("");
const currentMembers: Ref<SearchResponse | undefined> = ref();
const newMembers: Ref<SearchResponse | undefined> = ref();
/** When true both panels also retrieve the inactive concepts linked to their members */
const includeInactive = ref(false);
const loading = ref(false);
const loadError = ref("");
const selectedIri = ref<string>();
const directService = useDirectService();
let controller: AbortController | undefined;
const filterStore = useFilterStore();
const comparison = computed(() => compareMembers(currentMembers.value, newMembers.value));
const truncated = computed(() => isTruncated(currentMembers.value) || isTruncated(newMembers.value));
const coreSchemes: Ref<TTIriRef[]> = computed(() =>
  filterStore.coreSchemes.map(scheme => ({
    iri: scheme
  }))
);

const panels = computed(() => [
  {
    key: "current",
    title: "Current saved members ('-' indicates not in the new definition)",
    total: comparison.value.current.length,
    members: applyFilters(comparison.value.current),
    emptyMessage: emptyMessage(comparison.value.current.length, "No saved members.", "No members are removed by the new definition.")
  },
  {
    key: "new",
    title: "New definition members",
    total: comparison.value.updated.length,
    members: applyFilters(comparison.value.updated),
    emptyMessage: emptyMessage(
      comparison.value.updated.length,
      "The new definition generates no members.",
      "Definition does not create members that are not in the saved set."
    )
  }
]);

onMounted(async () => {
  await loadMembers();
});

onBeforeUnmount(() => controller?.abort());

watch(includeInactive, async () => await loadMembers());

// The parent supplies a new query object whenever the definition changes, e.g. after a member is added
watch(
  () => props.query,
  async () => await loadMembers()
);

/** Loads both member lists with the same includeInactive flag so that the comparison stays like for like */
async function loadMembers(): Promise<void> {
  controller?.abort();
  const thisController = new AbortController();
  controller = thisController;
  loading.value = true;
  loadError.value = "";
  try {
    const request = { query: props.query, includeInactive: includeInactive.value, schemeFilter: coreSchemes.value } as ECLQueryRequest;
    const [current, updated] = await Promise.all([
      SetService.getCurrentMembers(props.setIri, includeInactive.value, thisController),
      SetService.getMembersFromQuery(request, thisController)
    ]);
    currentMembers.value = current;
    newMembers.value = updated;
  } catch (err: any) {
    if (thisController.signal.aborted) return;
    currentMembers.value = undefined;
    newMembers.value = undefined;
    loadError.value = err?.message ?? "";
  } finally {
    if (controller === thisController) loading.value = false;
  }
}

function onRowClick(event: DataTableRowClickEvent): void {
  const member = event.data as ComparedMember;
  if (event.originalEvent instanceof MouseEvent && (event.originalEvent.ctrlKey || event.originalEvent.metaKey)) openInNewTab(member.iri);
  else selectedIri.value = member.iri;
}

async function openInNewTab(iri: string): Promise<void> {
  await directService.view(iri);
}

function applyFilters(members: ComparedMember[]): ComparedMember[] {
  const text = filterText.value.trim().toLowerCase();
  return members.filter(member => {
    if (viewMode.value === "changes" && member.change === "unchanged") return false;
    if (!text) return true;
    return member.name?.toLowerCase().includes(text) || member.code?.toLowerCase().includes(text);
  });
}

function emptyMessage(total: number, noMembers: string, noChanges: string): string {
  if (!total) return noMembers;
  if (filterText.value.trim()) return "No members match the filter.";
  return noChanges;
}

function rowClass(data: ComparedMember): string[] {
  const classes = ["member-" + data.change];
  if (isInactive(data)) classes.push("member-inactive");
  if (data.iri === selectedIri.value) classes.push("member-selected");
  return classes;
}
</script>

<style scoped>
.comparison-title {
  font-size: larger;
}

.comparison-loading {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.comparison-content {
  flex: 1 1 auto;
  display: flex;
  flex-flow: column nowrap;
  gap: 0.75rem;
  min-height: 0;
}

.comparison-toolbar {
  display: flex;
  flex-flow: row wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.comparison-summary,
.comparison-filters {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 0.5rem;
}

.comparison-panels {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  min-height: 0;
}

.comparison-panel {
  display: flex;
  flex-flow: column nowrap;
  min-width: 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.5rem 0.75rem;
  background: var(--p-content-hover-background);
}

.panel-title {
  font-weight: 600;
}

.panel-count {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.comparison-panel:deep(td) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}

.comparison-panel:deep(tr.member-added > td) {
  background: color-mix(in srgb, var(--p-green-500) 15%, transparent);
}

.comparison-panel:deep(tr.member-added .fa-plus) {
  color: var(--p-green-600);
}

.comparison-panel:deep(tr.member-removed > td) {
  background: color-mix(in srgb, var(--p-red-500) 15%, transparent);
}

.comparison-panel:deep(tr.member-removed .fa-minus) {
  color: var(--p-red-600);
}

.comparison-panel:deep(tr) {
  cursor: pointer;
}

.comparison-panel:deep(tr.member-inactive > td) {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.comparison-panel:deep(tr.member-selected > td) {
  box-shadow: inset 0 0 0 9999px color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}

.comparison-panels.with-hierarchy {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
}

.hierarchy-panel .panel-header {
  align-items: center;
}

.hierarchy-content {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
  max-height: 60vh;
}

.inactive-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
</style>
