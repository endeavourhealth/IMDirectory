<template>
  <div id="search-results-main-container">
    <DataTable
      ref="searchTable"
      v-model:selection="selected"
      :autoLayout="true"
      :first="first"
      :lazy="true"
      :loading="searchLoading"
      :paginator="true"
      :pt="{ thead: { class: 'z-1!' } }"
      :rows="rows"
      :rows-per-page-options="[rowsOriginal, rowsOriginal * 2, rowsOriginal * 4, rowsOriginal * 8]"
      :scrollable="true"
      :total-records="paginatorTotal"
      :value="searchResults"
      class="p-datatable-sm"
      contextMenu
      currentPageReportTemplate="Displaying {first} to {last} of {totalRecords} results"
      dataKey="iri"
      :paginatorTemplate="paginatorTemplate"
      scrollHeight="flex"
      selectionMode="single"
      @page="onPage($event)"
      @rowContextmenu="onRowContextMenu"
      @row-select="onRowSelect"
    >
      <template #empty> None </template>
      <Column bodyStyle="flex: 0 1 calc(100% - 19rem);" field="name" headerStyle="flex: 0 1 calc(100% - 19rem);">
        <template #header>
          <div class="header">
            <div class="results-title">
              <span>Results </span>
              <template v-if="totalKnown">
                <span v-if="totalCount">
                  <span>(</span>
                  <span data-testid="total-results">{{ totalCount }}</span>
                  <span>)</span>
                </span>
                <span v-else>0 found</span>
              </template>
            </div>
            <Button
              v-tooltip.right="'Download search results'"
              :disabled="!searchResults.length"
              label="Download..."
              @click="() => (showDownloadOptions = true)"
            />
          </div>
        </template>
        <template #body="{ data }">
          <div class="datatable-flex-cell">
            <IMFontAwesomeIcon v-if="data.icon" :icon="data.icon" :style="'color: ' + data.color" class="recent-icon" />
            <span class="break-word flex-1" @mouseleave="hideOverlay" @mouseover="showOverlay($event, data.iri)">{{ getNameDisplay(data) }}</span>
          </div>
        </template>
      </Column>
      <Column field="usageTotal" header="Weighting">
        <template #body="{ data }">
          <BatteryBar
            v-tooltip.left="{ value: data.usageTotal?.toString() ?? '0', class: 'entity-tooltip' }"
            :current-value="data.usageTotal ?? 0"
            :highest-value="highestUsage"
          />
        </template>
      </Column>
      <Column :exportable="false" bodyStyle="text-align: center; overflow: visible; justify-content: flex-end; flex: 0 1 14rem;" headerStyle="flex: 0 1 14rem;">
        <template #body="{ data }">
          <div class="buttons-container">
            <ActionButtons
              :buttons="!showSelect ? ['findInTree', 'view', 'edit', 'favourite'] : ['viewHierarchy', 'view', 'addToList']"
              :iri="data.iri"
              :name="data.name"
              @locate-in-tree="(iri: string) => emit('locateInTree', iri)"
              @view-hierarchy="(iri: string) => emit('viewHierarchy', iri)"
              @add-to-list="(iri: string) => emit('addToList', iri)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
    <ContextMenu ref="contextMenu" :model="rClickOptions" />
    <OverlaySummary ref="OS" />
    <DownloadByQueryOptionsDialog
      :show-core="false"
      :show-definition="false"
      :show-dialog="showDownloadOptions"
      :show-im1="false"
      :show-im1-id="false"
      :show-legacy="false"
      :show-subsumed-by="false"
      @download="download"
      @close-dialog="showDownloadOptions = false"
    />
  </div>
</template>

<script lang="ts" setup>
import { cloneDeep } from "lodash-es";
import { ComputedRef, Ref, computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BatteryBar, IMFontAwesomeIcon, OverlaySummary } from "@endeavour/vue-library/components";
import { useDownloadFile, useOverlay } from "@endeavour/vue-library/composables";
import { TextSearchStyle } from "@endeavour/vue-library/enums";
import { getColourFromType, getFAIconFromType, getNamesAsStringFromTypes, isArrayHasLength } from "@endeavour/vue-library/helpers";
import { PageSchema, QueryRequest, SearchResponse, SearchResultSummary } from "@endeavour/vue-library/models";
import { useUserStore } from "@endeavour/vue-library/stores";
import DataTable, { DataTablePageEvent, DataTableRowSelectEvent } from "primevue/datatable";
import { MenuItem } from "primevue/menuitem";
import { useDialog } from "primevue/usedialog";
import ActionButtons from "@/components/shared/ActionButtons.vue";
import LoadingDialog from "@/components/shared/dynamicDialogs/LoadingDialog.vue";
import { useDirectService } from "@/composables/useDirectService";
import { buildIMQueryFromFilters } from "@/helpers/buildQuery";
import type { DownloadByQueryOptions, ECLQueryRequest, ExtendedSearchResultSummary, FilterOptions, Namespace } from "@/models";
import { DownloadSettings, SearchOptions } from "@/models";
import { EclService, EntityService, QueryService, UserService } from "@/services";
import { useFilterStore } from "@/stores/filterStore";
import DownloadByQueryOptionsDialog from "./dialogs/DownloadByQueryOptionsDialog.vue";

interface Props {
  searchTerm?: string;
  updateSearch?: boolean;
  imQuery?: QueryRequest;
  eclQuery?: ECLQueryRequest;
  pageSize?: number;
  disablePageDropdown?: boolean;
  showSelect?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  rowSelected: [payload: SearchResultSummary];
  locateInTree: [payload: string];
  searchResultsUpdated: [payload: SearchResponse | undefined];
  addToList: [payload: string];
  viewHierarchy: [payload: string];
}>();

const modelLoading = defineModel<boolean | undefined>("loading");

onMounted(async () => {
  schemes.value = await EntityService.getNamespaces();
  if (props.pageSize) {
    rows.value = props.pageSize;
    rowsOriginal.value = props.pageSize;
  }
  if (props.searchTerm) await onSearch();
});

const userStore = useUserStore();
const dynamicDialog = useDialog();
const favourites = computed(() => userStore.favourites);
const filterStore = useFilterStore();
const searchLoading: Ref<boolean> = ref(false);
const { downloadFile } = useDownloadFile(window, document);
const selectedFilters: ComputedRef<FilterOptions> = computed(() => filterStore.selectedFilterOptions);
const schemes: Ref<Namespace[]> = ref([]);
const directService = useDirectService();

const selected: Ref<ExtendedSearchResultSummary> = ref({} as ExtendedSearchResultSummary);
const pageCache = ref<Record<number, ExtendedSearchResultSummary[] | undefined>>({});
const searchResults: Ref<ExtendedSearchResultSummary[]> = ref([]);
const totalCount = ref(0);
const highestUsage = ref(0);
const page = ref(0);
const first = ref(0);
const rows = ref(props.pageSize ? props.pageSize : 25);
const rowsOriginal = ref(props.pageSize ? props.pageSize : 25);
const searchTable = ref<InstanceType<typeof DataTable> | null>(null);
const total: Ref<number> = ref(0);
// The quick autocomplete search returns at most this many results and no usable total
const AUTOCOMPLETE_LIMIT = 20;
// false while only the quick autocomplete results are shown; true once paging uses the full search
const fullSearch = ref(false);
// false until a full search has reported the total number of results
const totalKnown = ref(false);
// With no total, give the paginator one row beyond the current page so that only "next" is offered
const paginatorTotal = computed(() => (totalKnown.value ? totalCount.value : first.value + rows.value + 1));
const paginatorTemplate = computed(() =>
  totalKnown.value
    ? "FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
    : "PrevPageLink NextPageLink RowsPerPageDropdown"
);
const rClickOptions: Ref<MenuItem[]> = ref([
  {
    label: "Select",
    icon: "fa-solid fa-sitemap",
    command: () => directService.select(selected.value.iri!)
  },
  {
    label: "View in new tab",
    icon: "fa-solid fa-arrow-up-right-from-square",
    command: () => directService.view(selected.value.iri!)
  },
  {
    separator: true
  },
  {
    label: "Favourite",
    icon: "fa-solid fa-star",
    command: () => updateFavourites()
  }
]);
const showDownloadOptions = ref(false);

const { OS, showOverlay, hideOverlay } = useOverlay();

const contextMenu = ref();

watch(
  () => props.updateSearch,
  async (newVal, oldVal) => {
    if (newVal !== oldVal) {
      searchResults.value = [];
      totalCount.value = 0;
      page.value = 0;
      first.value = 0;
      pageCache.value = {};
      fullSearch.value = false;
      totalKnown.value = false;
      await onSearch();
    }
  }
);

watch(
  () => searchLoading.value,
  () => (modelLoading.value = searchLoading.value)
);

let searchController: AbortController | undefined;
onBeforeUnmount(() => searchController?.abort());

async function onSearch() {
  // A new search replaces any still running (a changed term or page makes the old results irrelevant)
  searchController?.abort();
  const controller = (searchController = new AbortController());
  searchLoading.value = true;
  const requestedPage = page.value;
  try {
    let quickCount = 0;
    if (!props.eclQuery && !fullSearch.value && requestedPage === 0) {
      // A new text search starts with the quick autocomplete so the user can pick a result straight away
      const limit = Math.min(rows.value, AUTOCOMPLETE_LIMIT);
      const quick = await search(1, limit, TextSearchStyle.autocomplete, controller);
      if (controller.signal.aborted) return;
      emit("searchResultsUpdated", quick);
      processSearchResults(quick);
      totalKnown.value = false;
      quickCount = searchResults.value.length;
      // A full quick page: stop here with just a "next" arrow; the full search runs when the user pages on
      if (quickCount >= limit) {
        // Kept for paging back: the full search starts with this same set, so it need not be fetched again
        pageCache.value[0] = searchResults.value;
        return;
      }
      // Fewer than that: follow up with the full search unprompted, leaving the quick results selectable meanwhile
      fullSearch.value = true;
      if (quickCount) searchLoading.value = false;
    }
    // Full search: one request per page, so the rows shown are exactly the server's page
    const response = await search(requestedPage + 1, rows.value, TextSearchStyle.all, controller);
    if (controller.signal.aborted) return;
    emit("searchResultsUpdated", response);
    if (quickCount && !isArrayHasLength(response?.entities)) {
      // The full search added nothing, so the quick results are the complete list
      totalCount.value = quickCount;
      totalKnown.value = true;
    } else processSearchResults(response);
    if (searchResults.value.length) pageCache.value[requestedPage] = searchResults.value;
  } finally {
    if (searchController === controller) searchLoading.value = false;
  }
}

function updateRows(newRows: number) {
  rows.value = newRows;
  onSearch();
}

async function search(pageNumber: number, pageSize: number, searchStyle: TextSearchStyle, controller?: AbortController) {
  let response = undefined;
  if (props.eclQuery) {
    props.eclQuery.page = pageNumber;
    props.eclQuery.size = pageSize;
    response = await EclService.ECLSearch(props.eclQuery, controller);
  } else if (props.searchTerm && props.searchTerm.length > 2) {
    if (props.imQuery) {
      props.imQuery.textSearch = props.searchTerm;
      props.imQuery.page = PageSchema.parse({
        pageNumber: pageNumber,
        pageSize: pageSize,
        offset: (pageNumber-1)*pageSize
      });
      props.imQuery.textSearchStyle = searchStyle;
      response = await QueryService.queryIMSearch(props.imQuery, controller);
    } else {
      const searchOptions: SearchOptions = cloneDeep(selectedFilters.value);
      searchOptions.textSearch = props.searchTerm;
      searchOptions.page = PageSchema.parse({
        pageNumber: pageNumber,
        pageSize: pageSize,
        offset: (pageNumber-1)*pageSize
      });
      const imQuery = buildIMQueryFromFilters(searchOptions);
      imQuery.textSearchStyle = searchStyle;
      response = await QueryService.queryIMSearch(imQuery, controller);
    }
  }

  return response;
}
``;

async function updateFavourites(row?: { data: ExtendedSearchResultSummary }) {
  if (row) selected.value = row.data;
  await userStore.updateFavourites(selected.value.iri!, UserService);
}
function getNameDisplay(data: ExtendedSearchResultSummary): string {
  const name = data.bestMatch ? data.bestMatch : data.name;
  if (data.scheme && data.scheme.iri) {
    return (data.code ? name + " | " + data.code : name) + " [" + schemes.value.find(s => s.iri === data.scheme!.iri!)?.prefix + "]";
  } else return name + " | " + data.code;
}

function isFavourite(iri: string) {
  if (!favourites.value?.length) return false;
  return favourites.value.includes(iri);
}

function processSearchResults(searchResponse: SearchResponse | undefined): void {
  if (searchResponse?.entities && isArrayHasLength(searchResponse.entities)) {
    searchResults.value = mapSearchResults(searchResponse);
    if (searchResponse.totalCount != null) {
      totalCount.value = searchResponse.totalCount;
      totalKnown.value = true;
    }
    if (searchResponse.size) total.value = searchResponse.size;
    highestUsage.value = searchResponse.highestUsage ?? 0;
  } else {
    // Nothing came back for this page: never leave the previous page's rows on screen
    searchResults.value = [];
    if (page.value === 0) {
      totalCount.value = 0;
      totalKnown.value = true;
    }
  }
}
function mapSearchResults(searchResponse: SearchResponse) {
  return searchResponse.entities!.map(result => {
    const copy = cloneDeep(result) as ExtendedSearchResultSummary;
    copy.icon = getFAIconFromType(result.type);
    copy.color = getColourFromType(result.type);
    copy.typeNames = getNamesAsStringFromTypes(result.type);
    copy.favourite = isFavourite(result.iri);
    return copy;
  });
}

function updateRClickOptions() {
  if (selected.value.iri) rClickOptions.value[rClickOptions.value.length - 1].label = isFavourite(selected.value.iri) ? "Unfavourite" : "Favourite";
}

async function onPage(event: DataTablePageEvent) {
  if (event.rows !== rows.value) {
    // Page size changed: cached pages no longer line up, so restart from the first page
    rows.value = event.rows;
    page.value = 0;
    first.value = 0;
    pageCache.value = {};
  } else {
    page.value = event.page;
    first.value = event.first;
  }
  // Paging on from the quick autocomplete results: every further page comes from the full search
  fullSearch.value = true;
  if (pageCache.value[page.value]) {
    searchResults.value = pageCache.value[page.value]!;
  } else {
    await onSearch();
  }
}

function scrollToTop() {
  const scrollArea = document.getElementsByClassName("p-datatable-scrollable-table")[0] as HTMLElement;
  scrollArea?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function onRowContextMenu(event: { originalEvent: MouseEvent; data: ExtendedSearchResultSummary }) {
  selected.value = event.data;
  updateRClickOptions();
  contextMenu.value.show(event.originalEvent);
}

async function onRowSelect(event: DataTableRowSelectEvent<ExtendedSearchResultSummary>) {
  const mouseEvent = event.originalEvent as MouseEvent;
  if (event.data.iri) {
    if (mouseEvent.metaKey || mouseEvent.ctrlKey) {
      await directService.view(event.data.iri);
    } else {
      const found = searchResults.value.find(result => event.data.iri === result.iri);
      if (found) {
        await hideOverlay();
        emit("rowSelected", found);
      }
    }
  }
}

async function download(downloadSettings: DownloadSettings): Promise<void> {
  const downloadDialog = dynamicDialog.open(LoadingDialog, {
    props: { modal: true, closable: false, closeOnEscape: false, style: { width: "50vw" } },
    data: { title: "Downloading", text: "Preparing your download..." }
  });
  let downloadQuery: QueryRequest | undefined;
  let eclSearchRequest: ECLQueryRequest | undefined;
  if (props.eclQuery) {
    eclSearchRequest = cloneDeep(props.eclQuery);
    eclSearchRequest.page = 1;
    eclSearchRequest.size = props.pageSize;
  }
  if (props.searchTerm && props.searchTerm.length > 2) {
    if (props.imQuery) {
      downloadQuery = cloneDeep(props.imQuery);
      downloadQuery.textSearch = props.searchTerm;
      downloadQuery.page = PageSchema.parse({ pageNumber: 1, pageSize: total.value });
    } else {
      const searchOptions: SearchOptions = cloneDeep(selectedFilters.value);
      searchOptions.textSearch = props.searchTerm;
      searchOptions.page = PageSchema.parse({ pageNumber: 1, pageSize: total.value });
      downloadQuery = buildIMQueryFromFilters(searchOptions);
    }
  }
  if (downloadQuery || eclSearchRequest) {
    const options = {
      queryRequest: downloadQuery,
      eclSearchRequest: eclSearchRequest,
      totalCount: totalCount.value,
      format: downloadSettings.selectedFormat
    } as DownloadByQueryOptions;
    const result = await EntityService.downloadSearchResults(options);
    if (result) downloadFile(result, "search-results-" + new Date().toJSON().slice(0, 10).replace(/-/g, "/") + "." + downloadSettings.selectedFormat);
  }
  downloadDialog.close();
}
</script>

<style scoped>
#search-results-main-container {
  height: 100%;
  flex: 1 1 auto;
  overflow: auto;
  background-color: var(--p-content-background);
  display: flex;
  flex-flow: column nowrap;
}

.buttons-container {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: center;
}

.break-word {
  word-break: normal;
}

.recent-icon {
  height: 1rem;
  font-size: 1rem;
}

.datatable-flex-cell {
  display: -webkit-box;
  display: flex;
  -webkit-box-flex: 1;
  flex: 1 1 0;
  gap: 0.25rem;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
}

.header {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
