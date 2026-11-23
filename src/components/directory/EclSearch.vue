<template>
  <div id="ecl-search-container">
    <h3 class="title">Expression constraints language search</h3>
    <div class="input-container">
      <h5 class="info">ECL expression:</h5>
      <div class="text-copy-container">
        <div class="ecl-panel">
          <div class="ecl-container">
            <div ref="highlightDiv" class="html-preview" v-html="highlightedText" />
            <Textarea
              id="query-string-container"
              v-model="eclQueryString"
              class="transparent-textarea"
              data-testid="query-string"
              placeholder="Enter expression here or use the ECL builder to generate your search..."
              @keydown="onKeyDown"
              @keyup="onKeyUp"
            />
            <div class="flex items-center">
              <Button
                v-clipboard:copy="copyToClipboard()"
                v-clipboard:error="onCopyError"
                v-clipboard:success="onCopy"
                v-tooltip.left="'Copy to clipboard'"
                :disabled="!eclQueryString.length"
                class="ml-4"
                data-testid="copy-to-clipboard-button"
                icon="fa-solid fa-copy"
              />
            </div>
          </div>

          <div v-if="setDefinition.status!.valid" class="flex flex-row items-center">
            <label for="">Show names </label>
            <Checkbox v-model="showNames" :binary="true" class="m-2" />
          </div>
          <div v-if="!setDefinition.status!.valid" class="error-message">
            Invalid ECL : line {{ setDefinition.status!.line }}, offset {{ setDefinition.status!.offset }} -> {{ setDefinition.status!.message }}
          </div>
        </div>
      </div>
    </div>
    <div class="button-container">
      <Button data-testid="builder-button" label="ECL builder" severity="help" @click="showBuilder" />
      <Button
        :disabled="!eclQueryString.length || !setDefinition.status!.valid"
        :loading="searchLoading"
        class="p-button-primary"
        data-testid="ecl-search-button"
        label="Search"
        @click="onSearch()"
      />
    </div>
    <div class="filters-container">
      <div class="status-filter p-inputgroup">
        <FloatLabel>
          <MultiSelect id="status" v-model="selectedStatus" :options="statusOptions" display="chip" optionLabel="name" @change="onSearch()" />
          <label for="status">Select status:</label>
        </FloatLabel>
      </div>
    </div>
    <div v-if="setDefinition && setDefinition.query" class="results-container">
      <ResultsTable
        v-model:loading="searchLoading"
        :ecl-query="setDefinition"
        :page-size="12"
        :update-search="updateSearch"
        @locateInTree="(iri: string) => $emit('locateInTree', iri)"
        @rowSelected="(selected: SearchResultSummary) => emit('selectedUpdated', selected)"
      />
    </div>
    <ECLBuilder
      v-if="showDialog && setDefinition && setDefinition.query"
      :key="builderKey"
      :query="setDefinition.query"
      :showDialog="showDialog"
      @closeDialog="showDialog = false"
      @eclSubmitted="updateECL"
    />
  </div>
</template>

<script lang="ts" setup>
import { Ref, computed, onMounted, ref, watch } from "vue";
import { useCopyToClipboard } from "@endeavour/vue-library/composables";
import { byName } from "@endeavour/vue-library/helpers";
import { type GenericObject, type SearchResultSummary, type TTIriRef } from "@endeavour/vue-library/models";
import ECLBuilder from "@/components/imquery/ECLBuilder.vue";
import ResultsTable from "@/components/shared/ResultsTable.vue";
import { type ECLQueryRequest } from "@/models";
import { EclService } from "@/services";
import { useEditorStore } from "@/stores/editorStore";
import { useFilterStore } from "@/stores/filterStore";

const emit = defineEmits<{
  locateInTree: [payload: string];
  selectedUpdated: [payload: SearchResultSummary];
}>();

const filterStore = useFilterStore();
const editorStore = useEditorStore();
const statusOptions = computed(() => filterStore.filterOptions.status);
const savedEcl = computed(() => editorStore.eclEditorSavedString);
const eclQueryString = ref("");
const { copyToClipboard, onCopy, onCopyError } = useCopyToClipboard(eclQueryString);
const showDialog = ref(false);
const showNames = ref(false);
const eclErrorMessage = ref("");
const selectedStatus: Ref<TTIriRef[]> = ref([]);
const builderKey = ref(0);
const keysPressed: GenericObject = {};
const updateSearch: Ref<boolean> = ref(false);
const searchLoading: Ref<boolean> = ref(false);
const setDefinition: Ref<ECLQueryRequest> = ref({ status: { valid: true } });
const debounceTimer = ref(0);
const lastValidEcl: Ref<string> = ref("");
const highlightedText = computed(() => {
  const lines = eclQueryString.value.split("\n");
  if (setDefinition.value && setDefinition.value.status && !setDefinition.value.status.valid) {
    const eclStatus = setDefinition.value.status;
    const lineIndex = eclStatus.line! - 1;
    const offset = eclStatus.offset!;
    if (lines[lineIndex] && offset < lines[lineIndex].length) {
      const line = lines[lineIndex];
      lines[lineIndex] = line.slice(0, offset) + '<span class="error-char">' + line[offset] + "</span>" + line.slice(offset + 1);
    }
  }
  return lines.map(line => line || "&nbsp;").join("<br/>");
});

watch(eclQueryString, newValue => {
  clearTimeout(debounceTimer.value);
  debounceTimer.value = window.setTimeout(async (): Promise<void> => {
    await validateECL(newValue);
  }, 600);
});

watch(selectedStatus, () => {
  selectedStatus.value.sort(byName);
});

watch(showNames, async (newValue, oldValue) => {
  if (newValue !== oldValue) {
    await showOrHideNames();
  }
});

onMounted(async () => {
  setFilterDefaults();
  if (savedEcl.value) eclQueryString.value = savedEcl.value;
  if (eclQueryString.value) {
    await validateECL(eclQueryString.value);
  }
});

async function validateECL(ecl: string) {
  setDefinition.value = await EclService.validateECL(ecl, showNames.value);
  if (setDefinition.value && setDefinition.value.status) {
    if (!setDefinition.value.status.valid) {
      setDefinition.value.query!.invalid = true;
    } else {
      lastValidEcl.value = eclQueryString.value;
      editorStore.updateEclEditorSavedString(lastValidEcl.value);
    }
  }
}

async function showOrHideNames() {
  setDefinition.value = await EclService.getEclFromEcl(eclQueryString.value, showNames.value);
  if (setDefinition.value.status && setDefinition.value.status.valid) {
    eclQueryString.value = setDefinition.value.ecl!;
  } else showNames.value = !showNames.value;
}

async function onKeyDown(event: KeyboardEvent) {
  keysPressed[event.key] = true;
  if (keysPressed["Control"] && keysPressed["Enter"] && eclQueryString.value.length && setDefinition.value.status!.valid) await onSearch();
}

function onKeyUp(event: KeyboardEvent) {
  delete keysPressed[event.key];
}

function updateECL(eclQuery: ECLQueryRequest): void {
  eclQueryString.value = eclQuery.ecl!;
  showDialog.value = false;
}

function showBuilder(): void {
  if (lastValidEcl.value === "") {
    if (!setDefinition.value.query) setDefinition.value.query = {};
  }
  builderKey.value = Math.round(Math.random() * 1000);
  showDialog.value = true;
}

async function onSearch(): Promise<void> {
  if (eclQueryString.value) {
    const imQuery = await EclService.getQueryFromECL(eclQueryString.value);
    setDefinition.value = {
      query: imQuery.query,
      includeLegacy: false,
      status: imQuery.status,
      statusFilter: selectedStatus.value
    } as ECLQueryRequest;
    updateSearch.value = !updateSearch.value;
  }
}

function setFilterDefaults() {
  //selectedStatus.value = statusOptions.value.filter(option => option.iri === IM.ACTIVE);
}
</script>

<style scoped>
#ecl-search-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  align-items: center;
  padding: 1rem;
}

#query-string-container {
  width: 100%;
  height: 10rem;
  overflow: auto;
  flex-grow: 100;
  margin-right: 1rem;
}

.info {
  align-self: flex-start;
  margin: 0 0 0.5rem 0;
}

.button-container {
  display: flex;
  flex-flow: row;
  gap: 1rem;
  margin: 1rem 0 1rem 0;
}

.results-container {
  width: 100%;
  min-height: 40rem;
  flex: 0 1 auto;
  overflow: auto;
}

.error-message {
  color: var(--p-red-500);
}
:deep(.error-char) {
  text-decoration: underline red wavy;
}

.filters-container {
  width: 100%;
  display: flex;
  flex-flow: row wrap;
}

.status-filter {
  width: 20rem;
  padding: 1.25rem 0.5rem 0.5rem 0.5rem;
  justify-self: flex-start;
}

.text-copy-container {
  width: 100%;
  display: flex;
  flex-flow: row;
  align-items: center;
}

.ecl-panel {
  flex: 1 1 auto;
  display: flex;
  flex-flow: column nowrap;
  gap: 0.5rem;
  font-size: 1rem;
}

.ecl-container {
  position: relative;
  height: 100%;
  flex: 1 1 auto;
  display: flex;
}

.html-preview {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  resize: none;
  pointer-events: none;
  font-family: inherit;
  font-size: 1rem;
  border: 1px solid transparent;
  box-sizing: border-box;
  padding: 0.5rem;
  color: transparent;
  z-index: 1;
}
.transparent-textarea {
  min-height: 15rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  margin-top: 0.5rem;
}

.input-container {
  width: 98%;
  flex: 0 1 auto;
}
</style>
