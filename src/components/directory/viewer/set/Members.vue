<template>
  <div id="members-table-container">
    <DataTable
      v-model:first="first"
      v-model:rows="pageSize"
      :currentPageReportTemplate="templateString"
      :lazy="true"
      :loading="loading"
      :paginator="true"
      :rowsPerPageOptions="[25, 50, 100]"
      :scrollable="true"
      :sortOrder="1"
      :totalRecords="totalCount"
      :value="members"
      class="p-datatable-sm"
      data-testid="table"
      paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
      scrollHeight="flex"
      showGridlines
      sortField="label"
      sortMode="single"
      @page="getPage($event)"
    >
      <template #empty>
        No direct or entailed members found.
        <div v-if="hasDefinition">
          <Button class="p-button-link" label="Download to see query definition results" @click="emit('openDownloadDialog')" />
        </div>
      </template>
      <template #loading> Loading data. Please wait... </template>
      <Column field="member" header="Name">
        <template #body="{ data }">
          <span v-if="data.exclude" class="exclude">Exclude</span>
          <IMViewerLink :action="'select'" :iri="data.iri" :label="data.name" @navigateTo="(iri: string) => emit('navigateTo', iri)" />
          <span class="entailment" v-html="getEntailment(data)"></span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script lang="ts" setup>
import { Ref, onMounted, ref, watch } from "vue";
import { IM } from "@endeavour/vue-library/enums";
import { isObjectHasKeys } from "@endeavour/vue-library/helpers";
import type { Node, Query } from "@endeavour/vue-library/models";
import IMViewerLink from "@/components/shared/IMViewerLink.vue";
import { EntityService, SetService } from "@/services";

const props = defineProps<{
  entityIri?: string;
  eclQuery?: Query;
}>();

const emit = defineEmits<{
  onOpenTab: [payload: string];
  navigateTo: [payload: string];
  openDownloadDialog: [];
}>();
const hasDefinition: Ref<boolean> = ref(false);
const loading = ref(true);
const members: Ref<Node[] | undefined> = ref([]);

const templateString = ref("Displaying {first} to {last} of [Loading...] concepts");
const totalCount: Ref<number | undefined> = ref(0);
const first = ref(0);
const pageSize = ref(25);

watch(
  () => props.entityIri,
  async () => {
    await init();
  }
);

watch(
  () => props.eclQuery,
  async () => {
    await init();
  }
);

onMounted(async () => {
  await init();
});

async function init() {
  first.value = 0;
  await getMembers();
  await setHasDefinition();
}

async function setHasDefinition() {
  if (props.entityIri) {
    const entity = await EntityService.getPartialEntity(props.entityIri, [IM.DEFINITION]);
    hasDefinition.value = isObjectHasKeys(entity, [IM.DEFINITION]);
  }
  if (props.eclQuery) {
    hasDefinition.value = true;
  }
}

async function getMembers(): Promise<void> {
  loading.value = true;
  try {
    const page = Math.floor(first.value / pageSize.value) + 1;
    let paged;
    if (props.entityIri) paged = await SetService.getMembers(props.entityIri, true, page, pageSize.value);
    if (paged) {
      members.value = paged.result;
      totalCount.value = paged.totalCount;
      templateString.value = "Displaying {first} to {last} of {totalRecords} concepts";
    }
  } finally {
    loading.value = false;
  }
}

async function getPage(event: { first: number; rows: number }) {
  first.value = event.first;
  pageSize.value = event.rows;
  await getMembers();
}

function getEntailment(data: any) {
  if (data.descendantsOrSelfOf) return "(+ subtypes)";
  if (data.descendantsOf) return "(subtypes of only)";
  if (data.ancestorsOf) return "(+ supertypes)";
  return "";
}
</script>
<style scoped>
#members-table-container {
  height: 100%;
  width: 100%;
}

#members-table-container:deep(td) {
  width: 100%;
  overflow: auto;
  word-break: break-all;
}

#members-table-container:deep(.p-datatable) {
  width: 100%;
  height: 100%;
}

#members-table-container:deep(.p-datatable-table) {
  width: 100%;
}

#members-table-container:deep(.p-datatable-wrapper) {
  height: auto;
  flex: 0 1 auto;
}
#members-table-container:deep(.exclude) {
  color: var(--p-red-500);
  padding-right: 0.3rem;
}

.custom-button span {
  flex: 1 1 auto;
  display: block;
  width: 100%;
  height: 100%;
}

.custom-button span:before,
.custom-button span:after {
  position: absolute;
  content: "";
  background: steelblue;
}
.custom-button span:before {
  left: 0;
  top: 0;
  width: 0;
  height: 2px;
  transition: all 500ms ease;
}
.custom-button span:after {
  right: 0;
  bottom: 0;
  width: 0;
  height: 2px;
  transition: all 500ms ease;
}
.custom-button span:hover:before {
  width: 100%;
}
.custom-button span:hover:after {
  width: 100%;
}

.entailment {
  padding-left: 0.2rem;
}
</style>
