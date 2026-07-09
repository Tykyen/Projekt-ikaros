export interface IkarosDiscussion {
  id: string;
  title: string;
  description: string;
  bulletin: string;
  creatorId: string;
  creatorName: string;
  /** D-040 — tombstone overlay pro vlákno, jehož autor byl anonymizován. */
  creatorIsDeleted?: boolean;
  isApproved: boolean;
  isOpen: boolean;
  managerIds: string[];
  invitedUserIds: string[];
  joinRequestIds: string[];
  postCount: number;
  likeCount: number;
  createdAtUtc: Date;
  lastActivityUtc: Date;
}

export interface IkarosDiscussionPost {
  id: string;
  discussionId: string;
  authorId: string;
  authorName: string;
  /** D-040 — tombstone overlay pro post, jehož autor byl anonymizován. */
  authorIsDeleted?: boolean;
  content: string;
  createdAtUtc: Date;
  /** B4d — moderačně skrytý příspěvek (M2/M3); veřejné cesty ho vynechají. */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
}
